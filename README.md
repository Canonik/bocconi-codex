# Bocconi Codex

> Hackathon winner.

Bocconi Codex is a source-backed AI buddy for Bocconi students. It answers questions about moving to Milan, campus life, study abroad, and career readiness using the bundled Bocconi knowledge base plus a small set of targeted public sources.

The assistant persona is **Beatrice**: an editor, not a generic chatbot. She answers in the student's language when the signal is clear, cites real source paths, and refuses cleanly when the archive does not support a claim.

## Live App

- Backend evaluator URL: `https://bocconi-buddy-canonik-production.up.railway.app`
- Frontend URL: `https://bocconi-buddy-canonik-web-production.up.railway.app`
- Evaluator endpoint: `POST /ask`
- Health check: `GET /health`

The backend URL is the automatic evaluation target. The frontend is the human-facing product for demo and review.

## What It Covers

Bocconi Codex covers all four required student-life areas:

- `relocation`: housing, Milan neighborhoods, transport, bureaucracy, healthcare, arrival logistics.
- `life_on_campus`: dining, library, sports, associations, well-being, inclusion, events.
- `study_abroad`: exchange, double degrees, partner universities, international opportunities.
- `career_readiness`: internships, Career Service, scholarships, fees, programs, alumni, job-market data.

## How It Behaves

The product is tuned for reliability under the hackathon scoring rules:

- Answers are grounded in the local `backend/data/` archive.
- Each response returns source paths in `sources[]`.
- False premises are surfaced directly.
- Missing information becomes an honest abstention, not a fabricated answer.
- Responses stay within the 30-second evaluation budget.
- The public `/ask` contract is kept exactly as required.

Request:

```json
{
  "question": "Which partner universities offer a Double Degree in Finance?"
}
```

Response:

```json
{
  "answer": "Natural-language answer...",
  "sources": ["data/study_abroad/example.md"],
  "verticale": "study_abroad"
}
```

## Current Evaluation Signal

Platform pre-test #1 scored **125/160** with **0 wrong answers**. The misses were partial or no-answer cases, so the next iteration preserved the no-fabrication behavior and focused on richer synthesis plus targeted coverage.

The current deployed backend includes:

- R6 synthesis prompting for fuller answers when the retrieved context supports detail.
- 7 indexed external-source files for the Test #1 gap pattern, including ATM under-27 annual pass data, Milan arrival bureaucracy, dining-hours depth, and 2026-27 Bocconi Graduate Merit Awards.
- A deployed retrieval index of **9,720 chunks** from **1,624 manifest files**.

Latest HTTP evaluation against the public backend: **19 pass, 1 partial, 0 abstain, 0 wrong**, score **195/200** on the 20-question local bank. This is directional, not the official Level-1 score.

Known caveat: a very terse English question over Italian-dominant sources can occasionally receive an Italian answer. Longer English questions in the same area answer in English correctly.

## Interface

The frontend is an editorial "reading room" rather than a standard chat page:

- Four visual sections map to the four required verticals.
- Sample questions let a student begin without knowing what to ask.
- Answers render as sourced articles with a bibliography.
- A Resources drawer exposes curated links and a satellite-style Bocconi area map.
- The UI is mobile-checked at 360, 414, and 1024 pixel widths.
- Motion and loading states make waiting feel intentional, not broken.

The visual language uses Bauhaus-inspired primitives, strong typography, and color-coded verticals while keeping the actual task simple: ask a student-life question, get a grounded answer.

## Architecture

- Backend: FastAPI, OpenAI, SQLite plus `sqlite-vec`.
- Frontend: Vite, React, TypeScript.
- Retrieval index: `backend/data/index/buddy.db`, built offline and shipped with the backend image.
- Indexed corpus: 9,720 chunks from the bundled Bocconi and targeted public-source archive.
- Embeddings: `text-embedding-3-large` with 1024 dimensions.
- Generation: current fast OpenAI model family configured in `backend/llm.py`.

Runtime requests embed only the user's question. The corpus is never re-indexed at startup or during a request.

## Local Development

Create `.env` from the template and add the OpenAI API key generated after redeeming the event credit:

```bash
cp .env.example .env
```

Backend:

```bash
cd backend
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

Smoke test:

```bash
curl -X POST http://localhost:8000/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Where can I find dining areas on the Bocconi campus?"}'
```

## Deployment

The app deploys as two Railway services:

- `backend/`: FastAPI service. This is the evaluator target.
- `frontend/`: Vite static site. `VITE_BACKEND_URL` must point to the backend public URL before build.

The backend Dockerfile fails the build if `backend/data/index/buddy.db` is missing. It also prints the index size during build so a stale-image or missing-index deploy is easier to catch before a pre-test.

## Submission Files

- `PRODUCT_DESCRIPTION.md`: short product description for the submission form.
- `PITCH_TALKING_POINTS.md`: concise pitch notes for a human demo.
- `BRIEF.md`: challenge rules and scoring model.
- `AGENTS.md`: technical constraints, especially the frozen `/ask` contract.
- `COORDINATION.md`: live multi-agent status board.

Never commit `.env` or an API key.
