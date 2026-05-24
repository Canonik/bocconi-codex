"""Post-build retrieval augmentations.

Applies a small, version-controlled list of factually-grounded keyword
prefixes to specific chunks in `backend/data/index/buddy.db`. Each entry
re-embeds + replaces the chunk's row in `chunks`, `chunks_fts`, and
`vec_chunks` so that all three signals (dense, sparse, LLM context) see
the augmented text.

Why augmentations live here, not in `build_index.py`:
- The source markdown files are scraped artifacts. We don't want to edit
  them in-place, and we don't want the chunker to invent content.
- A small list of TARGETED augmentations keyed by chunk_id is auditable
  and reversible. Each entry should cite WHICH retrieval miss it fixes
  and WHY the keywords are factually present in the file.

Idempotent: re-running on an already-augmented DB is a no-op (the augment
prefix is detected and not re-applied).

Usage:
  uv run python backend/scripts/apply_augmentations.py
"""

from __future__ import annotations

import logging
import sqlite3
import struct
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import sqlite_vec  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from llm import embed_batch  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = _BACKEND_DIR / "data" / "index" / "buddy.db"
_AUGMENT_PREFIX_MARKER = "Keywords for retrieval:"


# Each augmentation: chunk_id → keyword line. The keyword line MUST list
# entities that are already present in the source chunk (e.g. as hyperlink
# anchors). Lift the embedding signal without inventing facts.
AUGMENTATIONS: dict[str, str] = {
    # S8 (Bocconi Merit Award): the canonical funding-international-applicants
    # page lists "Bocconi merit award", "Bocconi Award - Artificial Intelligence",
    # "Cyber Scholarship", and "Bocconi4Access" as hyperlinked merit-based
    # scholarships. Without this prefix, dense retrieval ranks the chunk at
    # position 11 because the body's leading 200+ tokens are generic
    # "Graduate Support Scheme" preamble. Re-prefixing lifts dense rank to 1
    # and hybrid rank to 1 (verified 2026-05-09).
    (
        "data/career_readiness/"
        "www-unibocconi-it-en-applying-bocconi-master-science-and-ma-programs-funding-international-applicants.md"
        "#chunk_1"
    ): (
        "Keywords for retrieval: Bocconi Merit Award (Bocconi graduate "
        "merit-based scholarship); Bocconi Award - Artificial Intelligence; "
        "Cyber Scholarship; Bocconi4Access to Education; ISU Bocconi "
        "scholarship; tuition waivers for Master of Science / MA programs; "
        "graduate-level merit-based and need-based scholarships."
    ),
}


# DRAFT augmentations — NOT auto-applied. The `apply()` function below only
# touches `AUGMENTATIONS`. To activate one of these, MOVE its entry into the
# `AUGMENTATIONS` dict above, then re-run the script.
#
# Drafted 2026-05-09 13:55 in case Test #3 shows career_readiness still weak
# after the Merit Awards rollback. The placement-program files share an
# identical generic title ("Program Placement | Bocconi University") and
# identical nav-cruft preamble across all 18 placement files in the corpus,
# so chunk_0 of each file dilutes the program-specific embedding signal.
# These two are the highest-traffic candidates (Bocconi flagship + broadest-
# enrollment MSc).
#
# Activation criterion: Test #3 result post-rollback shows career_readiness
# still <30/40 AND pattern feedback flags placement-statistics misroutes.
# Otherwise, leave drafted; the chunks already rank top-1 on direct queries.
#
# Each keyword line names ONLY entities already present verbatim in the
# source chunk (top-recruiter lists, employment rates, working-abroad %).
_DRAFT_PLACEMENT_AUGMENTATIONS: dict[str, str] = {
    # MSc Finance — chunk 0 has 94.9% employed @ 1y, 60.8% abroad, 82.7% on
    # graduation day, 6.9 interviews avg, 2 offers avg, plus the top-recruiter
    # list (BofA Merrill, Barclays, BlackRock, BNP Paribas, Citigroup, Credit
    # Agricole, Deloitte, Deutsche Bank, EY, HSBC, Intesa Sanpaolo, J.P. Morgan,
    # KPMG, Lazard, LSE Group, McKinsey, Mediobanca, Morgan Stanley, PwC,
    # Rothschild, Royal Bank of Canada, BCG, Goldman Sachs, UBS, UniCredit).
    (
        "data/career_readiness/"
        "www-unibocconi-it-en-programs-master-science-finance-program-placement.md"
        "#chunk_0"
    ): (
        "Keywords for retrieval: Bocconi MSc Finance program placement; "
        "Master of Science in Finance graduate employment outcomes; "
        "employment rate one year after graduation; % employed on graduation "
        "day; % of employed graduates working abroad; average number of job "
        "interviews and job offers received; top recruiters in investment "
        "banking, consulting and asset management for Bocconi Finance "
        "graduates (Goldman Sachs, Morgan Stanley, J.P. Morgan, BlackRock, "
        "Lazard, Mediobanca, Rothschild, McKinsey, BCG, BofA Merrill Lynch, "
        "Deutsche Bank, BNP Paribas, UBS, UniCredit, Intesa Sanpaolo)."
    ),
    # MSc International Management — chunk 0 has 94.6% employed @ 1y, 52.8%
    # abroad, 78.4% on graduation day, 71.7% abroad on graduation; chunk 1 has
    # the top-recruiter list (JP Morgan, Kering, KPMG, LVMH, Marsh McLennan,
    # MBS Consulting, McKinsey, Microsoft, P&G, Pirelli, PwC, Roland Berger,
    # UBS, UniCredit). The augmentation prefix goes on chunk_0 to anchor the
    # program-name + headline-stats embedding.
    (
        "data/career_readiness/"
        "www-unibocconi-it-en-programs-master-science-international-management-program-placement.md"
        "#chunk_0"
    ): (
        "Keywords for retrieval: Bocconi MSc International Management (MSc IM) "
        "program placement; Master of Science in International Management "
        "graduate employment outcomes; employment rate one year after graduation; "
        "% employed on graduation day; % of employed graduates working abroad; "
        "top recruiters in management consulting, luxury and tech for Bocconi "
        "International Management graduates (McKinsey, Roland Berger, Kering, "
        "LVMH, P&G, Microsoft, KPMG, PwC, J.P. Morgan, UBS, UniCredit, Pirelli, "
        "Marsh & McLennan)."
    ),
}


log = logging.getLogger("apply_augmentations")


def _serialize_vec(vec: list[float]) -> bytes:
    return struct.pack(f"{len(vec)}f", *vec)


def _open_db(db_path: Path) -> sqlite3.Connection:
    if not db_path.is_file():
        raise FileNotFoundError(
            f"index DB missing at {db_path}. Run build_index.py first."
        )
    conn = sqlite3.connect(db_path)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    return conn


def apply(db_path: Path = DEFAULT_DB_PATH) -> dict[str, int]:
    """Apply all augmentations. Returns counts: applied / skipped / missing."""
    conn = _open_db(db_path)
    counts = {"applied": 0, "skipped": 0, "missing": 0}

    pending: list[tuple[str, str]] = []
    for chunk_id, keyword_line in AUGMENTATIONS.items():
        row = conn.execute(
            "SELECT text FROM chunks WHERE chunk_id = ?", (chunk_id,)
        ).fetchone()
        if row is None:
            log.warning("chunk not found, skipping: %s", chunk_id)
            counts["missing"] += 1
            continue
        existing = row[0]
        if existing.startswith(_AUGMENT_PREFIX_MARKER):
            counts["skipped"] += 1
            continue
        pending.append((chunk_id, keyword_line + "\n\n" + existing))

    if not pending:
        log.info("no augmentations needed (all already applied or missing)")
        conn.close()
        return counts

    new_texts = [t for _, t in pending]
    log.info("re-embedding %d augmented chunk(s)", len(new_texts))
    new_embeddings = embed_batch(new_texts)

    with conn:
        for (chunk_id, new_text), embedding in zip(pending, new_embeddings):
            conn.execute(
                "UPDATE chunks SET text = ? WHERE chunk_id = ?",
                (new_text, chunk_id),
            )
            conn.execute(
                "DELETE FROM chunks_fts WHERE chunk_id = ?", (chunk_id,)
            )
            conn.execute(
                "INSERT INTO chunks_fts (chunk_id, text) VALUES (?, ?)",
                (chunk_id, new_text),
            )
            conn.execute(
                "DELETE FROM vec_chunks WHERE chunk_id = ?", (chunk_id,)
            )
            conn.execute(
                "INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)",
                (chunk_id, _serialize_vec(embedding)),
            )
            counts["applied"] += 1
            log.info("  augmented %s", chunk_id)

    conn.close()
    return counts


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_dotenv(REPO_ROOT / ".env")
    counts = apply()
    log.info("done: %s", counts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
