# CONTRACTS.md — Bocconi Buddy internal contracts

> Internal agreements between modules. Do NOT change `/ask` schema (frozen by AGENTS.md).
> This file is the source of truth for the trunk / data / UI agents working in parallel.

## 1. Frozen public contract (DO NOT TOUCH)

POST /ask
- Request: `{"question": str}` — `min_length=1`.
- Response (HTTP 200 ALWAYS, even on errors and abstentions):
  ```
  {
    "answer": str,           // natural-language answer in the question's language
    "sources": list[str],    // real paths under data/ (no fabrication)
    "verticale": Verticale   // one of relocation | life_on_campus | study_abroad | career_readiness
  }
  ```
- No streaming. No async/job pattern. No auth. Method = POST only. Path = exactly `/ask`.

## 2. Types

```python
from typing import Literal, TypedDict

Verticale = Literal["relocation", "life_on_campus", "study_abroad", "career_readiness"]

class RetrievedChunk(TypedDict):
    chunk_id: str        # stable, e.g. f"{path}#chunk_{i}"
    text: str            # raw chunk content
    path: str            # source-of-truth file path under data/, returned in sources[]
    title: str           # frontmatter title
    verticale: Verticale # frontmatter verticale
    language: str        # frontmatter language (en|it|...)
    source_url: str      # frontmatter source_url
    score: float         # similarity score after re-rank (cosine or hybrid)
```

`path` is relative to `backend/`, exactly as the file appears under `data/...`
(e.g. `data/career_readiness/almalaurea-it-sintesi-condizione-occupazionale-laureati-2024.md`).
The evaluator may check `sources[]` for grounding.

## 3. Retrieval function signature

```python
def retrieve(
    question: str,
    *,
    verticale: Verticale | None,
    k: int = 8,
) -> list[RetrievedChunk]: ...
```

- If `verticale` is provided: filter results to that verticale at the index level
  (`WHERE verticale = ?` in sqlite-vec; metadata filter in Chroma; post-filter for FAISS).
- If `None`: search across all verticali (used as a fallback when classifier confidence is low).
- Returns top-k by hybrid (BM25 + dense) or pure dense similarity. Order: highest score first.
- The function makes ONE OpenAI call: embedding the user's question. No generation calls inside `retrieve`.
- Pure function on the index; no global mutable state; safe to call from any handler.

## 4. Verticale classifier signature

```python
def classify_verticale(question: str) -> tuple[Verticale, float]: ...
```

- Returns `(verticale, confidence)` with `confidence ∈ [0, 1]`.
- Default implementation: `gpt-5.4-nano` zero-shot with a 4-class structured output (Pydantic schema).
- Latency budget: ≤ 500 ms.
- MUST NOT raise. On any error, return `("life_on_campus", 0.0)` and let downstream retrieval go cross-verticale.
- When confidence < 0.5, the caller SHOULD pass `verticale=None` to `retrieve` (cross-verticale search).

## 5. Ingestion entrypoint (one-shot, local, BEFORE deploy)

```bash
uv run python backend/scripts/build_index.py
```

- Walks `backend/data/{relocation,life_on_campus,study_abroad,career_readiness}/`.
- Parses YAML frontmatter (`verticale`, `language`, `title`, `source_url`, `token_estimate`).
- Chunks each markdown file (~600-token chunks, 80-token overlap; respect markdown headings; keep frontmatter title in chunk metadata, NOT in the chunk text).
- Embeds chunks with `text-embedding-3-large` (Matryoshka-truncated to 1024 dims for storage / speed).
- Writes the vector store to `backend/data/index/buddy.db` (sqlite-vec).
- Idempotent: re-running rebuilds from scratch unless `--incremental` is passed.
- Cost expectation: ~$0.40, 5–10 min wall-clock for the full corpus.

NEVER called at request time. NEVER called at app startup.
The production Dockerfile COPYs the prebuilt index into the image.
The index file is in `.gitignore` (regenerable) but NOT in `.dockerignore`.

## 6. Frontend ↔ backend contract

- The frontend calls `${VITE_BACKEND_URL}/ask` with `POST` and `Content-Type: application/json`.
- Body: `{"question": "<user input>"}`. No extra fields. No auth headers.
- On non-200 OR network error, the frontend shows a calm "Try again" UI — never a red 5xx toast.
- `verticale` is rendered as a colored badge per DESIGN.md.
- `sources` is rendered as clickable chips showing the file path; opening the original file is best-effort.
- `VITE_BACKEND_URL` is inlined at build time; it MUST be set on Railway BEFORE `railway up` for the frontend.

## 7. Vector store decision (default: sqlite-vec)

Per AGENTS.md, default to SQLite + `sqlite-vec`, single file `backend/data/index/buddy.db`. Schema:

```sql
CREATE TABLE chunks (
    chunk_id   TEXT PRIMARY KEY,
    path       TEXT NOT NULL,
    title      TEXT,
    verticale  TEXT NOT NULL,
    language   TEXT,
    source_url TEXT,
    text       TEXT NOT NULL
);
CREATE INDEX idx_chunks_verticale ON chunks(verticale);

CREATE VIRTUAL TABLE vec_chunks USING vec0(
    chunk_id TEXT PRIMARY KEY,
    embedding FLOAT[1024]
);
```

Query (top-k filtered by verticale):

```sql
SELECT c.chunk_id, c.path, c.title, c.verticale, c.language, c.source_url, c.text, v.distance
FROM   vec_chunks v
JOIN   chunks c USING (chunk_id)
WHERE  c.verticale = :v
ORDER  BY v.embedding MATCH :q
LIMIT  :k;
```

Fallback if `sqlite-vec` install is flaky in the build: FAISS in-memory + a parallel `chunks.parquet` for metadata (interface unchanged).

## 8. Model picks (locked for slice 1; revisit on rate-limit signal)

| Stage              | Model                    | Why                                                     |
|--------------------|--------------------------|---------------------------------------------------------|
| Generation         | `gpt-5.4-mini`           | $0.75/$4.50 per 1M, 400k ctx, multilingual, ~sub-2s     |
| Classifier / rerank| `gpt-5.4-nano`           | $0.20/$1.25 per 1M, optimized for low-latency ranking   |
| Embedding          | `text-embedding-3-large` | $0.13 per 1M, 3072d Matryoshka→1024d, MIRACL 54.9%      |

If `gpt-5.4-mini` rate-limits under load: switch sibling (`gpt-5.4`, then `gpt-5.2`) before raising retry counts.
