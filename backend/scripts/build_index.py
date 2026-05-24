"""Build the Bocconi Buddy retrieval index.

LOCAL ONLY. Run once before deploy. Never imported by the FastAPI app.

    uv run python backend/scripts/build_index.py                    # full corpus
    uv run python backend/scripts/build_index.py --subset 'career_readiness/accounting*'
    uv run python backend/scripts/build_index.py --dry-run          # chunk + DB schema, no API calls
    uv run python backend/scripts/build_index.py --incremental      # skip chunk_ids already in DB

Schema and chunk-level fields are fixed by CONTRACTS.md. Do not change without
coordinating with the trunk and api agents.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import logging
import os
import re
import sqlite3
import struct
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Sequence

# --- Path setup so `from llm import embed` works when run as a script ------
# build_index.py lives at backend/scripts/. Add backend/ to sys.path so the
# flat-layout `llm.py` is importable. main.py uses the same convention via
# uvicorn's cwd=backend.
_BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import sqlite_vec  # noqa: E402
import tiktoken  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from llm import embed_batch  # noqa: E402  -- batched OpenAI embeddings,
#                                tenacity + dimensions=1024 from llm.py

# --- Constants -------------------------------------------------------------

CHUNK_TARGET_TOKENS = 600
CHUNK_OVERLAP_TOKENS = 80
MIN_CHUNK_TOKENS = 30  # below this, the chunk is mostly boilerplate
EMBED_BATCH_SIZE = 64  # inputs per OpenAI request; ~600-token chunks * 64
#                        ≈ 38k tokens, well under the 300k-tokens-per-request limit.
VERTICALI = ("relocation", "life_on_campus", "study_abroad", "career_readiness")

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
DATA_ROOT = BACKEND_ROOT / "data"
DEFAULT_DB_PATH = DATA_ROOT / "index" / "buddy.db"
MANIFEST_PATH = DATA_ROOT / "manifest.json"

# Lines that are pure boilerplate from scraped pages. Conservative: only
# patterns that recur many times across the corpus, never anything that
# could carry a fact.
_BOILERPLATE_PATTERNS = (
    re.compile(r"^\s*\[Skip to Main Content\].*$", re.MULTILINE),
    re.compile(r"^\s*\[Richiesta di rimozione della fonte\].*$", re.MULTILINE),
    re.compile(r"^\s*\[This website was built on Wix\..*$", re.MULTILINE),
    # Stand-alone image lines with no caption text after the `]`.
    re.compile(r"^\s*!\[[^\]]*\]\([^)]*\)\s*$", re.MULTILINE),
)


log = logging.getLogger("build_index")


# --- Types -----------------------------------------------------------------


@dataclass(frozen=True)
class Document:
    """A source markdown file with frontmatter already extracted."""

    path: str  # e.g. "data/career_readiness/foo.md" — stored verbatim in chunks.path
    verticale: str
    language: str
    title: str
    source_url: str
    body: str  # markdown without the YAML frontmatter block


@dataclass(frozen=True)
class Chunk:
    """A single embeddable unit, ready for the chunks + vec_chunks tables."""

    chunk_id: str  # f"{path}#chunk_{i}"
    path: str
    title: str
    verticale: str
    language: str
    source_url: str
    text: str


# --- Frontmatter parser ----------------------------------------------------

_FRONTMATTER_RE = re.compile(
    r"\A---\s*\n(.*?)\n---\s*\n?",
    re.DOTALL,
)


def split_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """Return (frontmatter_dict, body). Empty dict + full text if no frontmatter."""
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    raw = match.group(1)
    body = text[match.end() :]
    fm: dict[str, str] = {}
    for line in raw.splitlines():
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        key, _, value = line.partition(":")
        fm[key.strip()] = value.strip().strip("'\"")
    return fm, body


def clean_body(text: str) -> str:
    """Strip recurring boilerplate. Conservative — keeps facts, drops noise."""
    for pattern in _BOILERPLATE_PATTERNS:
        text = pattern.sub("", text)
    # Collapse 3+ newlines to 2 (Markdown paragraph break).
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# --- Document loader -------------------------------------------------------


def load_manifest(manifest_path: Path = MANIFEST_PATH) -> list[dict[str, object]]:
    """Read manifest.json and return its `files` list."""
    with manifest_path.open("r", encoding="utf-8") as f:
        manifest = json.load(f)
    files = manifest.get("files")
    if not isinstance(files, list):
        raise RuntimeError(f"manifest.json at {manifest_path} has no `files` list")
    return files


def matches_subset(rel_path: str, patterns: Sequence[str]) -> bool:
    """True if `rel_path` matches any of the glob patterns. Empty patterns = match-all."""
    if not patterns:
        return True
    return any(fnmatch.fnmatch(rel_path, p) for p in patterns)


def iter_documents(
    data_root: Path = DATA_ROOT,
    subset_patterns: Sequence[str] = (),
) -> Iterator[Document]:
    """Yield Document objects for every markdown file in the manifest.

    `path` on the Document carries the `data/` prefix per CONTRACTS.md §2 — that's
    what ends up in `sources[]` in the /ask response, so it must be stable.
    """
    files = load_manifest(data_root / "manifest.json")
    for entry in files:
        rel_path = str(entry["path"])  # e.g. "career_readiness/foo.md"
        if not matches_subset(rel_path, subset_patterns):
            continue
        abs_path = data_root / rel_path
        if not abs_path.is_file():
            log.warning("manifest references missing file: %s", abs_path)
            continue
        raw = abs_path.read_text(encoding="utf-8")
        frontmatter, body = split_frontmatter(raw)
        body = clean_body(body)
        if not body:
            continue
        yield Document(
            path=f"data/{rel_path}",
            verticale=str(entry.get("verticale") or frontmatter.get("verticale", "")),
            language=str(entry.get("language") or frontmatter.get("language", "")),
            title=str(entry.get("title") or frontmatter.get("title", "")),
            source_url=str(entry.get("source_url") or frontmatter.get("source_url", "")),
            body=body,
        )


# --- Chunker ---------------------------------------------------------------

_HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)$", re.MULTILINE)


def split_on_headings(body: str) -> list[str]:
    """Split markdown body on H1/H2/H3 boundaries, keeping each heading with its section."""
    matches = list(_HEADING_RE.finditer(body))
    if not matches:
        return [body] if body.strip() else []
    sections: list[str] = []
    # Pre-amble before the first heading.
    if matches[0].start() > 0:
        prefix = body[: matches[0].start()].strip()
        if prefix:
            sections.append(prefix)
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        section = body[start:end].strip()
        if section:
            sections.append(section)
    return sections


def chunk_section(
    section: str,
    encoder: tiktoken.Encoding,
    target_tokens: int = CHUNK_TARGET_TOKENS,
    overlap_tokens: int = CHUNK_OVERLAP_TOKENS,
) -> list[str]:
    """Split a section into ~target_tokens windows with overlap, on paragraph boundaries when possible."""
    tokens = encoder.encode(section)
    if len(tokens) <= target_tokens:
        return [section]
    # Paragraph-aware: try to keep \n\n boundaries inside windows.
    paragraphs = re.split(r"\n{2,}", section)
    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0
    for para in paragraphs:
        para_tokens = len(encoder.encode(para))
        if current_tokens + para_tokens > target_tokens and current:
            chunks.append("\n\n".join(current).strip())
            # Overlap: pull the tail of the previous chunk so context carries over.
            tail_text = chunks[-1]
            tail_tokens = encoder.encode(tail_text)[-overlap_tokens:]
            tail_decoded = encoder.decode(tail_tokens)
            current = [tail_decoded, para]
            current_tokens = len(tail_tokens) + para_tokens
        else:
            current.append(para)
            current_tokens += para_tokens
    if current:
        chunks.append("\n\n".join(current).strip())

    # Final pass: any chunk still over 1.5x target → hard token split with overlap.
    finalized: list[str] = []
    for c in chunks:
        toks = encoder.encode(c)
        if len(toks) <= int(target_tokens * 1.5):
            finalized.append(c)
            continue
        step = target_tokens - overlap_tokens
        for i in range(0, len(toks), step):
            window = toks[i : i + target_tokens]
            if not window:
                break
            finalized.append(encoder.decode(window).strip())
            if i + target_tokens >= len(toks):
                break
    return [c for c in finalized if c]


def chunkify(doc: Document, encoder: tiktoken.Encoding) -> list[Chunk]:
    """Turn a Document into a list of embeddable Chunks with stable IDs."""
    chunks: list[Chunk] = []
    sections = split_on_headings(doc.body)
    pieces: list[str] = []
    for section in sections:
        pieces.extend(chunk_section(section, encoder))
    for i, text in enumerate(pieces):
        if len(encoder.encode(text)) < MIN_CHUNK_TOKENS:
            continue
        chunks.append(
            Chunk(
                chunk_id=f"{doc.path}#chunk_{i}",
                path=doc.path,
                title=doc.title,
                verticale=doc.verticale,
                language=doc.language,
                source_url=doc.source_url,
                text=text,
            )
        )
    return chunks


# --- Embedding -------------------------------------------------------------


def serialize_vec(vec: Sequence[float]) -> bytes:
    """Pack a float32 vector for sqlite-vec's BLOB storage format."""
    return struct.pack(f"{len(vec)}f", *vec)


def embed_many(texts: Sequence[str]) -> list[list[float]]:
    """Embed a list of strings via `llm.embed_batch` (single OpenAI call per
    `EMBED_BATCH_SIZE` slice). Order-preserving. Tenacity + 20s timeout +
    sibling fallback are inside `embed_batch`."""
    out: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH_SIZE):
        out.extend(embed_batch(list(texts[i : i + EMBED_BATCH_SIZE])))
    return out


# --- Database --------------------------------------------------------------

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS chunks (
    chunk_id   TEXT PRIMARY KEY,
    path       TEXT NOT NULL,
    title      TEXT,
    verticale  TEXT NOT NULL,
    language   TEXT,
    source_url TEXT,
    text       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_verticale ON chunks(verticale);

CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
    chunk_id TEXT PRIMARY KEY,
    embedding FLOAT[1024]
);

-- BM25 sparse index for hybrid retrieval. `chunk_id UNINDEXED` keeps it
-- queryable without contributing to the BM25 score; `text` is the only
-- searched column. Stored alongside the dense index in the same DB so the
-- Docker image only ships one file.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    chunk_id UNINDEXED,
    text,
    tokenize = 'unicode61 remove_diacritics 2'
);
"""


def open_db(db_path: Path, *, fresh: bool) -> sqlite3.Connection:
    """Open the index DB. If `fresh`, drop existing data tables first (idempotent rebuild)."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    if fresh and db_path.exists() and db_path.stat().st_size > 0:
        conn.executescript(
            "DROP TABLE IF EXISTS chunks; "
            "DROP TABLE IF EXISTS vec_chunks; "
            "DROP TABLE IF EXISTS chunks_fts;"
        )
    conn.executescript(SCHEMA_SQL)
    conn.commit()
    return conn


def existing_chunk_ids(conn: sqlite3.Connection) -> set[str]:
    return {row[0] for row in conn.execute("SELECT chunk_id FROM chunks")}


def insert_chunks(
    conn: sqlite3.Connection,
    chunks: Sequence[Chunk],
    embeddings: Sequence[Sequence[float]],
) -> None:
    """Atomically insert a batch of chunks + their embeddings + their FTS5 rows."""
    assert len(chunks) == len(embeddings), "chunk/embedding length mismatch"
    with conn:
        conn.executemany(
            """INSERT OR REPLACE INTO chunks
               (chunk_id, path, title, verticale, language, source_url, text)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [
                (c.chunk_id, c.path, c.title, c.verticale, c.language, c.source_url, c.text)
                for c in chunks
            ],
        )
        conn.executemany(
            "INSERT OR REPLACE INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)",
            [(c.chunk_id, serialize_vec(e)) for c, e in zip(chunks, embeddings)],
        )
        # FTS5 has no native ON CONFLICT; on `--incremental` we DELETE-then-INSERT.
        conn.executemany(
            "DELETE FROM chunks_fts WHERE chunk_id = ?",
            [(c.chunk_id,) for c in chunks],
        )
        conn.executemany(
            "INSERT INTO chunks_fts (chunk_id, text) VALUES (?, ?)",
            [(c.chunk_id, c.text) for c in chunks],
        )


# --- Driver ----------------------------------------------------------------


def batched(items: Sequence[Chunk], n: int) -> Iterator[Sequence[Chunk]]:
    for i in range(0, len(items), n):
        yield items[i : i + n]


def build(
    *,
    subset_patterns: Sequence[str] = (),
    incremental: bool = False,
    dry_run: bool = False,
    db_path: Path = DEFAULT_DB_PATH,
) -> dict[str, int]:
    """Run the full ingestion pipeline. Returns counts for the caller to log."""
    encoder = tiktoken.get_encoding("cl100k_base")

    log.info("collecting documents (subset=%s)", subset_patterns or "<all>")
    documents = list(iter_documents(subset_patterns=subset_patterns))
    log.info("loaded %d documents", len(documents))

    log.info("chunking")
    all_chunks: list[Chunk] = []
    for doc in documents:
        all_chunks.extend(chunkify(doc, encoder))
    log.info("produced %d chunks", len(all_chunks))

    by_verticale = {v: 0 for v in VERTICALI}
    for c in all_chunks:
        if c.verticale in by_verticale:
            by_verticale[c.verticale] += 1
    log.info("chunks by verticale: %s", by_verticale)

    if dry_run:
        log.info("dry-run: skipping DB write and embedding API calls")
        return {"documents": len(documents), "chunks": len(all_chunks), "embedded": 0}

    conn = open_db(db_path, fresh=not incremental)
    skip_ids: set[str] = existing_chunk_ids(conn) if incremental else set()
    if incremental:
        log.info("incremental: %d chunk_ids already indexed", len(skip_ids))

    pending = [c for c in all_chunks if c.chunk_id not in skip_ids]
    log.info("embedding %d chunks (skipping %d)", len(pending), len(all_chunks) - len(pending))

    if not pending:
        return {"documents": len(documents), "chunks": len(all_chunks), "embedded": 0}

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY missing. Set it in backend/.env (template at .env.example) "
            "before running without --dry-run."
        )

    # Single batched OpenAI request per `EMBED_BATCH_SIZE` slice (via
    # llm.embed_batch). DB-commit window is the same slice for memory bounding.
    total = len(pending)
    started = time.monotonic()
    embedded = 0
    for batch in batched(pending, EMBED_BATCH_SIZE):
        embeddings = embed_many([c.text for c in batch])
        insert_chunks(conn, batch, embeddings)
        embedded += len(batch)
        elapsed = time.monotonic() - started
        log.info(
            "  embedded %d/%d (%.1f chunks/s, %.0fs elapsed)",
            embedded,
            total,
            embedded / max(elapsed, 1e-6),
            elapsed,
        )

    conn.close()
    log.info("done. db at %s", db_path)
    return {"documents": len(documents), "chunks": len(all_chunks), "embedded": embedded}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--subset",
        action="append",
        default=[],
        metavar="PATTERN",
        help=(
            "Glob (matched against rel-path under data/, e.g. "
            "'career_readiness/accounting*'). Repeatable. Empty = full corpus."
        ),
    )
    parser.add_argument(
        "--incremental",
        action="store_true",
        help="Skip chunks already in the DB instead of rebuilding from scratch.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Chunk + report stats. No API calls, no DB write.",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"Output DB path (default: {DEFAULT_DB_PATH}).",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    if not args.dry_run:
        load_dotenv(BACKEND_ROOT.parent / ".env")  # repo root .env
        load_dotenv(BACKEND_ROOT / ".env", override=False)  # backend .env if present

    stats = build(
        subset_patterns=args.subset,
        incremental=args.incremental,
        dry_run=args.dry_run,
        db_path=args.db,
    )
    log.info("stats: %s", stats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
