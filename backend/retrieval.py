"""Retrieval over the prebuilt sqlite-vec index.

Public surface (per CONTRACTS.md §3):

    def retrieve(
        question: str,
        *,
        verticale: Verticale | None,
        k: int = 8,
    ) -> list[RetrievedChunk]: ...

`RetrievedChunk` matches CONTRACTS.md §2 exactly. The function makes ONE
OpenAI call (the question's embedding via `backend.llm.embed`) and runs a
single SQL query against `backend/data/index/buddy.db`. No generation, no
mutable global state beyond a memoized read-only DB connection.

The index file is built locally by `backend/scripts/build_index.py` and
shipped in the Docker image (NOT in `.dockerignore`). At runtime FastAPI
loads it on first call in milliseconds — no embedding of the corpus, ever.
"""

from __future__ import annotations

import logging
import re
import sqlite3
import struct
import threading
from pathlib import Path
from typing import Literal, TypedDict

import sqlite_vec

from llm import embed

Verticale = Literal["relocation", "life_on_campus", "study_abroad", "career_readiness"]


class RetrievedChunk(TypedDict):
    chunk_id: str
    text: str
    path: str
    title: str
    verticale: Verticale
    language: str
    source_url: str
    score: float


# --- Index location --------------------------------------------------------

_BACKEND_ROOT = Path(__file__).resolve().parent
DEFAULT_INDEX_PATH: Path = _BACKEND_ROOT / "data" / "index" / "buddy.db"
INDEX_PATH: Path = Path(__import__("os").getenv("BUDDY_INDEX_PATH", str(DEFAULT_INDEX_PATH)))

# Pull a wider candidate set than `k` so the post-filter on verticale still
# leaves enough hits — and so cross-verticale calls can rerank later.
_CANDIDATE_POOL = 50
# RRF constant for hybrid fusion. 60 is the standard from the original RRF
# paper (Cormack et al., 2009) and works well across most retrieval setups.
_RRF_K = 60

logger = logging.getLogger("buddy.retrieval")

_conn: sqlite3.Connection | None = None
_conn_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    """Return a process-wide, read-only sqlite-vec connection. Lazy-loaded."""
    global _conn
    if _conn is not None:
        return _conn
    with _conn_lock:
        if _conn is not None:  # double-checked locking
            return _conn
        if not INDEX_PATH.is_file():
            raise FileNotFoundError(
                f"Buddy index not found at {INDEX_PATH}. Build it first with "
                f"`uv run python backend/scripts/build_index.py`."
            )
        # `check_same_thread=False` makes the connection callable from FastAPI
        # workers; sqlite is happy with concurrent readers.
        conn = sqlite3.connect(
            f"file:{INDEX_PATH}?mode=ro",
            uri=True,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        _conn = conn
        return conn


def _serialize_query(vec: list[float]) -> bytes:
    return struct.pack(f"{len(vec)}f", *vec)


def _l2_to_score(distance: float) -> float:
    """Convert sqlite-vec's L2 distance (unit-norm vectors) to a [0,1] score.

    OpenAI's text-embedding-3-large returns L2-normalized vectors, so L2
    distance is in [0, 2] and `1 - d/2` is monotonically equivalent to
    cosine similarity for ranking purposes. Higher = better.
    """
    return max(0.0, 1.0 - distance / 2.0)


_FTS_TOKEN_RE = re.compile(r"\w+", flags=re.UNICODE)

# Stopword filter for the FTS5 query construction. The rationale: BM25
# already down-weights frequent terms across the corpus, but a question
# like "What is the maximum amount of the Bocconi Merit Award..." dilutes
# the OR-query with 10 high-frequency tokens, which can outweigh the 2-3
# distinctive ones ("Bocconi", "Merit", "Award"). Dropping the closed-class
# words concentrates BM25 on the content terms.
_STOPWORDS_EN = {
    "a", "an", "the", "of", "and", "or", "but", "if", "then", "so",
    "is", "are", "was", "were", "be", "been", "being", "am",
    "do", "does", "did", "doing", "done",
    "have", "has", "had", "having",
    "can", "could", "will", "would", "shall", "should", "may", "might", "must",
    "in", "on", "at", "by", "for", "with", "about", "against", "between",
    "to", "from", "up", "down", "out", "off", "over", "under",
    "as", "into", "through", "during", "before", "after",
    "this", "that", "these", "those",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "their", "our", "its",
    "what", "which", "who", "whom", "whose", "where", "when", "why", "how",
    "no", "not", "nor", "only", "own", "same", "than", "too", "very",
    "s", "t", "d", "ll", "m", "re", "ve", "y",
    "any", "some", "all", "each", "few", "more", "most", "other", "such",
    "there", "here", "now",
    "available", "different", "list", "show", "indicate", "explain",
    "provide", "structured", "table", "many", "much", "max", "min",
}
_STOPWORDS_IT = {
    "il", "lo", "la", "i", "gli", "le", "un", "una", "uno",
    "di", "da", "in", "a", "al", "alla", "allo", "ai", "agli", "alle",
    "del", "dello", "della", "dei", "degli", "delle",
    "per", "con", "su", "tra", "fra", "sul", "sulla", "sullo",
    "è", "sono", "era", "erano", "sia", "siano", "fu",
    "ha", "ho", "hai", "abbiamo", "avete", "hanno", "avere",
    "e", "ed", "o", "od", "ma", "se", "che", "come", "quando", "dove", "perché",
    "non", "no", "sì", "anche", "ancora", "già", "molto", "poco", "tanto",
    "questo", "quello", "questa", "quella", "questi", "quelle",
}
_STOPWORDS = _STOPWORDS_EN | _STOPWORDS_IT


def _to_fts_query(question: str) -> str:
    """Convert a natural-language question into an FTS5 OR-query.

    Default FTS5 MATCH treats space-separated tokens as AND, which is far
    too restrictive for natural-language questions. We OR-join only the
    content tokens (drop closed-class stopwords + 1-character tokens), so
    BM25 can rank documents by overlap with the *distinctive* terms.
    """
    tokens: list[str] = []
    for t in _FTS_TOKEN_RE.findall(question):
        lower = t.lower()
        if len(lower) <= 1:
            continue
        if lower in _STOPWORDS:
            continue
        tokens.append(lower)
    if not tokens:
        # Fall back to keeping every token if everything was filtered.
        tokens = [t.lower() for t in _FTS_TOKEN_RE.findall(question) if len(t) > 1]
    # Quote each token to escape any reserved FTS5 operator (AND, OR, NOT, NEAR).
    return " OR ".join(f'"{t}"' for t in tokens) or '""'


# --- Public API ------------------------------------------------------------


def _dense_candidates(
    conn: sqlite3.Connection,
    qbytes: bytes,
    pool: int,
    verticale: Verticale | None,
) -> list[sqlite3.Row]:
    """KNN over vec_chunks, JOIN to metadata, optional verticale filter."""
    return conn.execute(
        """
        WITH knn AS (
            SELECT chunk_id, distance
            FROM vec_chunks
            WHERE embedding MATCH ? AND k = ?
        )
        SELECT c.chunk_id, c.path, c.title, c.verticale, c.language,
               c.source_url, c.text, knn.distance
        FROM   knn
        JOIN   chunks c USING (chunk_id)
        WHERE  (? IS NULL OR c.verticale = ?)
        ORDER  BY knn.distance ASC
        LIMIT  ?
        """,
        (qbytes, pool, verticale, verticale, pool),
    ).fetchall()


def _bm25_candidates(
    conn: sqlite3.Connection,
    fts_query: str,
    pool: int,
    verticale: Verticale | None,
) -> list[sqlite3.Row]:
    """BM25 over chunks_fts, JOIN to metadata, optional verticale filter.

    `bm25(chunks_fts)` is FTS5's relevance score where lower (more
    negative) means more relevant. We expose it as a positive `score`
    via negation so the calling code can treat both signals uniformly.
    """
    return conn.execute(
        """
        WITH bm AS (
            SELECT chunk_id, bm25(chunks_fts) AS rank
            FROM chunks_fts
            WHERE text MATCH ?
            ORDER BY rank
            LIMIT ?
        )
        SELECT c.chunk_id, c.path, c.title, c.verticale, c.language,
               c.source_url, c.text, bm.rank AS distance
        FROM   bm
        JOIN   chunks c USING (chunk_id)
        WHERE  (? IS NULL OR c.verticale = ?)
        ORDER  BY bm.rank ASC
        LIMIT  ?
        """,
        (fts_query, pool, verticale, verticale, pool),
    ).fetchall()


def _row_to_chunk(r: sqlite3.Row, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=r["chunk_id"],
        text=r["text"],
        path=r["path"],
        title=r["title"] or "",
        verticale=r["verticale"],  # type: ignore[typeddict-item]
        language=r["language"] or "",
        source_url=r["source_url"] or "",
        score=score,
    )


def retrieve(
    question: str,
    *,
    verticale: Verticale | None,
    k: int = 8,
    hybrid: bool = False,
) -> list[RetrievedChunk]:
    """Top-k chunks for `question`, optionally filtered to a single verticale.

    Per CONTRACTS.md §3. Default behaviour is dense-only retrieval (locked
    by the slice-1 contract). `hybrid=True` opts into RRF fusion of dense
    + BM25 (FTS5), which lifts acronym/proper-noun questions like
    "Bocconi Merit Award" or "CLEF" that L2 alone misses. Disabled by
    default until trunk validates against the eval set.

    Pure function; safe to call from any handler.
    """
    if not question.strip():
        return []
    if k <= 0:
        return []

    pool = max(_CANDIDATE_POOL, k * 4)
    conn = _get_conn()
    qvec = embed(question)  # backend.llm: tenacity + 20s timeout, dims=1024
    qbytes = _serialize_query(qvec)

    dense = _dense_candidates(conn, qbytes, pool, verticale)
    if not hybrid:
        return [_row_to_chunk(r, _l2_to_score(float(r["distance"]))) for r in dense[:k]]

    fts_query = _to_fts_query(question)
    try:
        sparse = _bm25_candidates(conn, fts_query, pool, verticale)
    except sqlite3.OperationalError as exc:
        # FTS5 query parser can choke on edge-case input; fall back to dense.
        logger.warning("bm25 query failed (%s); using dense-only", exc)
        return [_row_to_chunk(r, _l2_to_score(float(r["distance"]))) for r in dense[:k]]

    # Reciprocal Rank Fusion. score = Σ 1/(K + rank), rank is 1-indexed.
    rrf: dict[str, float] = {}
    rows_by_id: dict[str, sqlite3.Row] = {}
    for rank, row in enumerate(dense, start=1):
        cid = row["chunk_id"]
        rrf[cid] = rrf.get(cid, 0.0) + 1.0 / (_RRF_K + rank)
        rows_by_id.setdefault(cid, row)
    for rank, row in enumerate(sparse, start=1):
        cid = row["chunk_id"]
        rrf[cid] = rrf.get(cid, 0.0) + 1.0 / (_RRF_K + rank)
        rows_by_id.setdefault(cid, row)

    fused = sorted(rrf.items(), key=lambda kv: kv[1], reverse=True)[:k]
    return [_row_to_chunk(rows_by_id[cid], score) for cid, score in fused]
