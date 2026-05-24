# EVAL.md — /ask test bank

Mode: **HTTP https://bocconi-buddy-canonik-production.up.railway.app** · Run at: 2026-05-09 14:52:51

| qid | category | lang | verdict | latency | verticale | sources | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | computational | en | pass | 3.01s | relocation | 8 | v+k match |
| S2 | actionable | en | pass | 10.46s | relocation | 8 | v+k match |
| S3 | computational | it | pass | 5.52s | relocation | 8 | v+k match |
| S4 | informative | it | pass | 3.07s | life_on_campus | 8 | v+k match |
| S5 | actionable | en | pass | 4.0s | life_on_campus | 8 | v+k match |
| S6 | computational | en | pass | 6.34s | study_abroad | 8 | v+k match |
| S7 | trap | en | pass | 5.33s | study_abroad | 8 | trap: false-premise surfaced |
| S8 | informative | en | pass | 5.24s | career_readiness | 8 | v+k match |
| S9 | trap | en | pass | 6.23s | career_readiness | 8 | trap: false-premise surfaced |
| S10 | computational | en | pass | 3.48s | life_on_campus | 8 | v+k match |
| G1 | informative | en | pass | 3.42s | relocation | 8 | v+k match |
| G2 | actionable | en | pass | 3.44s | life_on_campus | 8 | v+k match |
| G3 | informative | en | pass | 5.53s | career_readiness | 8 | v+k match |
| G4 | informative | it | pass | 5.12s | life_on_campus | 8 | v+k match |
| G5 | computational | en | pass | 4.2s | career_readiness | 8 | v+k match |
| G6 | trap | en | pass | 4.71s | career_readiness | 8 | trap: false-premise surfaced |
| G7 | actionable | it | pass | 5.22s | relocation | 8 | v+k match |
| G8 | computational | en | pass | 5.02s | study_abroad | 8 | v+k match |
| G9 | actionable | en | pass | 4.81s | career_readiness | 8 | v+k match |
| G10 | actionable | en | partial | 6.57s | career_readiness | 8 | v=False k=True |

## Summary (n=20)
- pass: **19**
- partial: **1**
- abstain: **0**
- wrong: **0**
- score (this bank): **195**

## Notes
- The official Level-1 evaluator uses an LLM judge that is more nuanced
  than this heuristic. Treat scores as a **directional signal**, not a
  literal predictor.
- For traps, surfacing the false premise scores as `pass`; clean
  abstention scores as `abstain` (0 points). Confident reply = `wrong`.
- Source-path existence is checked against `backend/data/`. If a path
  appears in `sources[]` that does not exist on disk, the verdict is
  downgraded with a `bad source paths` note.