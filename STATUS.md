# STATUS — Trunk: READY FOR TEST #3 — gpt-5.4 deployed (gpt-5.5 reverted on >25s kill-switch)

Backend at https://bocconi-buddy-canonik-production.up.railway.app, frontend at https://bocconi-buddy-canonik-web-production.up.railway.app. **Submit-state candidate** is the rollback baseline: R6 synthesis prompt + 6 verified external files (relocation × 5 — ATM, Codice Fiscale, Permesso, Comune residenza, Alphatest housing — and life_on_campus × 1 — Punti ristoro). Merit Awards file dropped from index (file still on disk, manifest only). AlmaLaurea integration and model upgrade BOTH cancelled per HUMAN 14:18 — corpus already has 18 Bocconi-branded program-placement files per data audit, AlmaLaurea is JS-rendered and unneeded. In-process eval 195/200, deployed parity 195/200. Live trunk state and milestones in `COORDINATION.md` § TRUNK.

- done: spec verify (no drift CONTRACTS↔main.py↔AGENTS); skills loaded; merged STATUS posts from UI + data; persona "Beatrice" recorded for slice-2 prompts.py
- in_progress: slice 1 — `pyproject.toml` (add tenacity, uncomment python-dotenv), `backend/llm.py` (tenacity + sibling fallback), hardcoded /ask 200
- blocked: none for trunk slice-1 (no LLM call yet). DATA AGENT IS BLOCKED on empty `.env` — escalating to human: paste redeemed `sk-...` into `.env` so build_index can run.
- next: write `llm.py` → swap /ask 501→200 hardcoded → curl smoke → mark slice-1 ready
- models (web-searched 2026-05): gen=`gpt-5.4-mini` ($0.75/$4.50), small=`gpt-5.4-nano` ($0.20/$1.25), embed=`text-embedding-3-large` ($0.13/M, 1024d Matryoshka). Sibling chain on 429: gpt-5.4-mini → gpt-5.4 → gpt-5.2.
- skills: spec-miner, fastapi-expert, python-pro
- merge note (pyproject.toml): I add `tenacity`, uncomment `python-dotenv`. Data agent owns vector-store deps. Section is small enough that a union merge is straightforward.
- coord: data-agent contract drift they flagged is correctly resolved per CONTRACTS.md §3 (`retrieve(question, *, verticale, k=8)`, no `language` param). Path format `data/<verticale>/<file>.md` with `data/` prefix is what `/ask` will return verbatim in `sources[]`.

---

# STATUS — UI agent (wt/ui) — slice 1 READY @ 11:06

> Coord moved to `COORDINATION.md` (Trunk's note from 10:50 applies to me too). This file is now my agent-local notebook only. Cross-agent state lives in COORDINATION.md → UI section.

## Slice 1 — concept + shell + working chat — DONE ✅

- [x] STATUS.md + COORDINATION.md UI section posted
- [x] Frontend deps installed: `tailwindcss@^4`, `@tailwindcss/vite`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`, `react-markdown`, `remark-gfm`, `radix-ui`, `@fontsource-variable/geist`, `@fontsource/instrument-serif`, `@fontsource-variable/jetbrains-mono`, `playwright` (devDep, smoke only).
- [x] `pnpm dlx shadcn@latest init -t vite -b radix -p nova` → added `button input textarea card scroll-area badge separator`. `components.json` written. Tsconfig path alias `@/*`. Vite plugin wired.
- [x] All tokens in `frontend/src/index.css` under `@theme inline`. NO placeholder OKLCH from DESIGN.md left. Verticale tints `--relocation` / `--life-on-campus` / `--study-abroad` / `--career-readiness`.
- [x] Fonts loaded via `@fontsource(-variable)` imports in CSS (no external CDN; bundled woff2). Inline SVG favicon in `index.html`.
- [x] `frontend/src/lib/api.ts` — typed `askBuddy(question, signal?) -> Promise<AskResponse>`; `AskError` discriminator (`network | http | parse | shape | aborted`); runtime shape guard against any non-conforming response.
- [x] Editorial shell `frontend/src/App.tsx` with state machine `idle → thinking → answered → error`:
  - `Masthead` (+ Beatrice ink-pulse on thinking)
  - `Composer` (autosize, Enter / Shift+Enter, ARIA-labeled, accessible)
  - `IssueGrid` (4 verticale plates with Roman numerals + tinted eyebrows + 12 sample-question chips drawn from SAMPLE_QUESTIONS.md)
  - `ThinkingColumn` (CSS ink-pulse + typeset shimmer — NOT API streaming)
  - `AnswerColumn` (markdown + GFM via react-markdown, drop-cap, verticale eyebrow with consistent tint, **bibliography** block of `sources[]`)
  - `ErrorPane` (calm "Errata" + Try-again / Back-to-issue, NOT a red toast)
  - Footer "Colophon" with type credits.
- [x] Verticale badge — one consistent color per verticale, 4-tint system applied to numerals, eyebrows, dividers, eyebrow dot in answer.
- [x] Sources rendered as a numbered mono-typed bibliography from the real `sources[]` array — never synthesized.
- [x] Viewport check — Playwright Node-API smoke (`scripts/smoke.mjs`) PASSES at 360 / 414 / 1024:
  - `innerWidth == docScrollWidth` everywhere → zero horizontal overflow.
  - 6 fonts loaded (Geist Variable × 3 weights, Instrument Serif normal + italic, JetBrains Mono).
  - 0 console errors / warnings on idle pages.
  - State-machine probe on offline backend: chip click → thinking → ErrorPane (calm UX confirmed).
  - Mocked-backend probe (Playwright `route.fulfill`): chip click → thinking → AnswerColumn renders with drop-cap, italic question, GFM bullets, terracotta verticale eyebrow + dot, 3 mono `data/relocation/*.md` source entries.
  - Screenshots saved to `frontend/screens/`: `mobile-360.png`, `mobile-414.png`, `desktop-1024.png`, `desktop-1024-after-chip.png`, `desktop-1024-answered.png`.
- [x] **shell ready** signal posted in COORDINATION.md MILESTONES at 11:06.

## /ask contract used (read-only)

`POST ${VITE_BACKEND_URL}/ask` with `{question: string}` → JSON `{answer: string, sources: string[], verticale: 'relocation' | 'life_on_campus' | 'study_abroad' | 'career_readiness'}`. Single complete body, HTTP 200 even on abstention. No SSE/NDJSON.

## Skills used (slice 1)

- DESIGN.md (the actual UI contract) — read cover-to-cover.
- react-expert (R19 patterns: ref-forwarding via spread, callback hooks, AbortController in-flight).
- typescript-pro (strict + `AskError` discriminator + `Verticale` literal + runtime shape guard).
- playwright-expert (Node-API smoke at multiple viewports + `route.fulfill` mocked-backend probe; ~80 LoC in `scripts/smoke.mjs`).
- (Codex `@theme-factory` / `@brand-guidelines` / `@canvas-design` referenced in the user prompt are Codex skills, not loaded in Claude env — applying their intent by hand from DESIGN.md.)

## Profile localStorage shape (reserved for slice 3)

```ts
type BuddyProfile = {
  year: 'first' | 'second' | 'graduate' | 'phd';
  program?: string;            // e.g. "MSc Finance"
  nationality: 'italian' | 'international';
  languagePref: 'en' | 'it';
};
// localStorage key: 'buddy.profile'
```

## Out of scope for slice 1 (queued for slice 2/3)

Per-verticale destination pages, conversation memory, custom verticale glyph SVGs, profile/onboarding modal, Vercel/Railway redeploy, raster image enhancement, advanced motion (Framer Motion).

## Files I will NOT touch

`backend/**`, `data/**`, `Dockerfile.*`, `docker-compose.dev.yml`, `*/railway.json`, any GitHub remote, any other agent's COORDINATION.md section.

## Notes from human (acknowledged)

- Submission is ONE-SHOT. ≥2 of 3 platform pre-tests before pressing submit. Don't burn test #3 on a state we don't intend to ship.
- I'll re-run the smoke against the live `/ask` URL when TRUNK fires PRE-TEST #1.

---

# STATUS — data agent (wt/data)

> Posted by the data agent. Updates every ~20 min.

## Slice 1 — MVP retrieval (in progress, target T+0:60)

### Vector store
**sqlite-vec**, schema fixed by CONTRACTS.md §7: data table `chunks(chunk_id, path, title, verticale, language, source_url, text)` + virtual `vec_chunks(chunk_id, embedding FLOAT[1024])` joined on `chunk_id`. Verticale filter at the index layer (`WHERE c.verticale = ?`).

### Embedding model
`text-embedding-3-large` Matryoshka-truncated to **1024 dims** (`dimensions=1024`). Cost ~$0.40 / ~6k chunks / 5–10 min, ONE-SHOT, LOCAL. Locked by CONTRACTS.md §5/§8 — not re-litigating.

### Skills used
- `rag-architect` — chunking on markdown headings + paragraph boundaries; deterministic IDs `{path}#chunk_{i}`; metadata enrichment from frontmatter.
- `python-pro` — Py 3.13, full type hints, `pathlib`, `Verticale` literal, dataclasses where they earn their keep.
- `sql-pro` — verticale index + JOIN-then-MATCH query shape (CONTRACTS.md §7).
- `database-optimizer` — held in reserve (engaged if `retrieve()` >500 ms).
- `test-master` — held in reserve (slice-2 retrieval-eval probes against `SAMPLE_QUESTIONS.md`).

### Steps + checkpoints
1. **T+0:00–0:05** Bootstrap deps. _(in progress)_
2. **T+0:05–0:25** `backend/scripts/build_index.py` — manifest-driven, token-aware chunking (`tiktoken cl100k_base`, ~600 tokens / 80 overlap, header-aware), batched embedding with tenacity retry, idempotent (`--incremental` skips known `chunk_id`), `--subset` for smoke runs.
3. **T+0:25–0:30** Subset run on `career_readiness/accounting*` (~5 files) to validate the full pipeline.
4. **T+0:30–0:40** Full corpus build (~6k chunks, ~$0.40). _Requires `OPENAI_API_KEY` in `.env` — see Blocked._
5. **T+0:40–0:55** `backend/retrieval.py` — `retrieve(question, *, verticale, k=8) -> list[RetrievedChunk]` per CONTRACTS.md §3 exactly.
6. **T+0:55–1:00** Smoke-test 3–5 sample questions across ≥2 verticali. Pass = ≥3/5 obviously-on-topic file in top-3.

### Notes for trunk
- Hackathon brief I received said `retrieve(query, *, verticale=None, language=None, top_k=8)`. CONTRACTS.md §3 says `retrieve(question, *, verticale, k=8)` (no `language`, `verticale` is keyword-only). **Implementing per the contract.** No `language` parameter — language is in `RetrievedChunk` for the API agent to honor when generating, not as a retrieval filter.
- `path` field follows CONTRACTS.md §2 example: `data/<verticale>/<file>.md`, relative to `backend/`, with `data/` prefix. The `sources[]` returned to the evaluator should reuse this verbatim.
- `backend/.dockerignore` already permits `backend/data/index/` (no exclusion present). Will create the directory but the `.db` file ships only after a build run.

### Done / In progress / Blocked / Next
- **Done**: read AGENTS.md + CONTRACTS.md + sample data files; loaded working-set skills; STATUS posted.
- **In progress**: `pyproject.toml` deps + `build_index.py` skeleton.
- **Blocked**: **`.env` is 0 bytes — `OPENAI_API_KEY` not set.** All code can be written + dry-run, but the embedding step (and therefore the full corpus build + the retrieval smoke-test) cannot run until the key is in place. Action requested: paste the redeemed `sk-...` key into `.env` (template at `.env.example`).
- **Next**: write `build_index.py`, then `retrieval.py`. Both runnable as soon as the key lands.
- **Chunks indexed**: 0 / ~6k expected.
- **Sources covered**: 0 / 4 verticali.
- **Vector store**: sqlite-vec.

### Files I will NOT touch
`backend/main.py`, `backend/prompts.py`, `backend/classify.py`, `backend/llm.py`, `/ask` schema, `frontend/**`, `Dockerfile.*`, `docker-compose.dev.yml`, `*/railway.json`.

### Files I own (slice-1 surface)
`backend/scripts/build_index.py`, `backend/retrieval.py`, `backend/data/index/buddy.db` (generated), `backend/pyproject.toml` (vector-store deps only).
