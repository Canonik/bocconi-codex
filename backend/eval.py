"""Evaluation harness for /ask.

Runs a 20-question test bank against the live or in-process /ask
endpoint and writes a pass/fail grid to EVAL.md at the repo root.

Categories follow SAMPLE_QUESTIONS.md (informative / computational /
actionable / trap). Both languages are exercised (~80% EN, ~20% IT)
to mirror the real eval distribution.

Verdicts approximate the official LLM-judge outcomes:
  pass    (+10) — verticale and at least one expected keyword in answer
  partial (+5)  — one of the two; or trap that abstained but mentioned
                  the named entity
  abstain (0)   — honest "I don't have that information"
  wrong   (-15) — schema break, latency >30s, no verticale match AND
                  no keyword match, or a confident reply on a trap

Usage:
  uv run python backend/eval.py                       # in-process (TestClient)
  BUDDY_API_URL=https://x.up.railway.app uv run python backend/eval.py

Writes:
  EVAL.md (repo root) — markdown table + summary
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, get_args
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# Bootstrap path + .env BEFORE importing anything that touches OpenAI.
_BACKEND = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND.parent
sys.path.insert(0, str(_BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(_REPO_ROOT / ".env")  # repo-root .env (docker-compose injects it in container)


Verticale = Literal["relocation", "life_on_campus", "study_abroad", "career_readiness"]


@dataclass(frozen=True)
class EvalCase:
    qid: str
    question: str
    category: str  # informative | computational | actionable | trap
    language: str  # en | it
    expected_verticale: Verticale
    expected_keywords: tuple[str, ...] = ()
    is_trap: bool = False
    abstain_acceptable: bool = False  # for trap: abstention is OK; surfacing premise is BETTER


# 10 SAMPLE_QUESTIONS items — copied verbatim from SAMPLE_QUESTIONS.md (the
# diagnostic set the human will calibrate against during the day).
SAMPLE_CASES: tuple[EvalCase, ...] = (
    EvalCase(
        "S1",
        "What is the price of an annual ATM transit pass for students under 27 in Milan, and how does it compare with the standard adult annual urban pass?",
        "computational", "en", "relocation",
        expected_keywords=("ATM", "annual", "pass", "EUR", "€"),
    ),
    EvalCase(
        "S2",
        "List the steps an international student must follow to register with Italy's National Health Service (SSN) in Milan.",
        "actionable", "en", "relocation",
        expected_keywords=("codice fiscale", "permesso", "ASL", "SSN"),
    ),
    EvalCase(
        "S3",
        "Confrontando i bus diretti da Malpensa a Milano Centrale tra i vettori documentati (Autostradale/Malpensa Bus Express, Terravision, Flibco, FlixBus): qual e' il prezzo di partenza piu' basso indicato per ciascun vettore?",
        "computational", "it", "relocation",
        expected_keywords=("Malpensa", "EUR", "€", "Autostradale", "Terravision"),
    ),
    EvalCase(
        "S4",
        "Quale documento devo portare per accedere alla Biblioteca Bocconi, e qual e' la capienza massima dell'edificio?",
        "informative", "it", "life_on_campus",
        expected_keywords=("badge", "ID", "QR", "720"),
    ),
    EvalCase(
        "S5",
        "Provide a structured table of the dining areas available on the Bocconi campus, indicating the location of each and its meal/opening pattern.",
        "actionable", "en", "life_on_campus",
        expected_keywords=("dining", "mensa", "campus", "lunch", "hours"),
    ),
    EvalCase(
        "S6",
        "For the Bocconi MSc graduate Exchange Program selection score, how are academic GPA, credits, and Bachelor degree grade weighted? Show the weights and explain.",
        "computational", "en", "study_abroad",
        expected_keywords=("GPA", "weight", "selection", "exchange", "%"),
    ),
    EvalCase(
        "S7",
        "What is the application deadline for the Bocconi Double Degree program with MIT (Massachusetts Institute of Technology)?",
        "trap", "en", "study_abroad",
        is_trap=True,
        abstain_acceptable=True,
        expected_keywords=("MIT", "Massachusetts"),
    ),
    EvalCase(
        "S8",
        "What is the maximum amount of the Bocconi Merit Award tuition waiver for graduate (Master of Science) students, and what is the format of the award (e.g. tuition waiver only, tuition waiver plus stipend, etc.)?",
        "informative", "en", "career_readiness",
        expected_keywords=("Merit", "tuition", "waiver", "EUR", "€"),
    ),
    EvalCase(
        "S9",
        "What are the placement results published in the 2026 BESS graduate survey?",
        "trap", "en", "career_readiness",
        is_trap=True,
        abstain_acceptable=True,
        expected_keywords=("BESS", "placement", "survey"),
    ),
    EvalCase(
        "S10",
        "How many different paid Bocconi Sport Membership tiers are listed for the 2025/2026 season, and which is the cheapest one available to UB and SDA Bocconi students?",
        "computational", "en", "life_on_campus",
        expected_keywords=("tier", "membership", "EUR", "€", "cheapest"),
    ),
)

# 10 self-generated, balanced across 4 categories x 2 langs.
GENERATED_CASES: tuple[EvalCase, ...] = (
    EvalCase(
        "G1",
        "What is the average monthly cost of a Bocconi residence room?",
        "informative", "en", "relocation",
        expected_keywords=("EUR", "€", "month", "residence"),
    ),
    EvalCase(
        "G2",
        "List the main libraries on the Bocconi campus and their typical opening hours.",
        "actionable", "en", "life_on_campus",
        expected_keywords=("library", "hours", "Mon", "Sat"),
    ),
    EvalCase(
        "G3",
        "Which research areas are covered by the BAFFI Research Centre at Bocconi?",
        "informative", "en", "career_readiness",
        expected_keywords=("BAFFI", "research", "finance", "policy"),
    ),
    EvalCase(
        "G4",
        "Quanto costa l'abbonamento annuale al Bocconi Sport Center per uno studente UB?",
        "informative", "it", "life_on_campus",
        expected_keywords=("Sport", "EUR", "€", "abbonamento", "anno"),
    ),
    EvalCase(
        "G5",
        "What is the most recent reported employment rate for Bocconi MSc graduates within 12 months of graduation?",
        "computational", "en", "career_readiness",
        expected_keywords=("%", "employment", "graduates", "AlmaLaurea"),
    ),
    EvalCase(
        "G6",
        "What's the application deadline for the Bocconi-FBI Joint Investigation Master Program?",
        "trap", "en", "career_readiness",
        is_trap=True,
        abstain_acceptable=True,
        expected_keywords=("FBI",),
    ),
    EvalCase(
        "G7",
        "Quali documenti servono per ottenere il codice fiscale come studente internazionale a Milano?",
        "actionable", "it", "relocation",
        expected_keywords=("codice fiscale", "passaporto", "Agenzia"),
    ),
    EvalCase(
        "G8",
        "Compare the Bocconi exchange opportunities in Tokyo and Singapore in terms of partner universities.",
        "computational", "en", "study_abroad",
        expected_keywords=("Tokyo", "Singapore", "partner"),
    ),
    EvalCase(
        "G9",
        "When is the next Open Day for the Bocconi MSc programs?",
        "actionable", "en", "career_readiness",
        expected_keywords=("Open Day", "MSc"),
    ),
    EvalCase(
        "G10",
        "How do I formally appeal a grade I think is incorrect at Bocconi?",
        "actionable", "en", "life_on_campus",
        expected_keywords=("appeal", "grade", "professor"),
    ),
)

ALL_CASES: tuple[EvalCase, ...] = SAMPLE_CASES + GENERATED_CASES


# --- Transports -----------------------------------------------------------


def _post_via_testclient(question: str) -> tuple[int, dict, float]:
    """In-process call via FastAPI TestClient. No network."""
    from fastapi.testclient import TestClient  # noqa: WPS433
    from main import app  # noqa: WPS433

    t0 = time.monotonic()
    with TestClient(app) as client:
        r = client.post("/ask", json={"question": question})
    return r.status_code, r.json(), time.monotonic() - t0


def _post_via_http(base_url: str, question: str) -> tuple[int, dict, float]:
    body = json.dumps({"question": question}).encode("utf-8")
    req = Request(
        f"{base_url.rstrip('/')}/ask",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.monotonic()
    with urlopen(req, timeout=35) as resp:  # noqa: S310 — controlled URL
        status = resp.status
        body_obj = json.loads(resp.read())
    return status, body_obj, time.monotonic() - t0


# --- Grading -------------------------------------------------------------


_ABSTENTION_MARKERS = (
    "i don't have",
    "i do not have",
    "no information",
    "non ho",
    "non e' disponibile",
    "i cannot answer",
    "non posso rispondere",
    "not in the bundled",
    "not available in",
    "non è disponibile",
)


def _is_abstention(answer: str) -> bool:
    a = answer.lower()
    return any(m in a for m in _ABSTENTION_MARKERS)


def _surfaces_false_premise(answer: str, named_entity_keywords: tuple[str, ...]) -> bool:
    """A trap response surfaces a false premise when it (a) names the
    nonexistent entity AND (b) explicitly notes its absence in the data.

    Strip markdown bold/italic markers before matching so that phrases like
    ``does **not** include`` register as negations.
    """
    a = answer.lower().replace("**", "").replace("*", "").replace("_", " ")
    names_it = any(k.lower() in a for k in named_entity_keywords)
    negates = any(
        m in a
        for m in (
            "no such",
            "does not",
            "doesn't",
            "do not",
            "don't",
            "is not",
            "isn't",
            "are not",
            "aren't",
            "not listed",
            "not in the bundled",
            "not in the bocconi data",
            "not appear",
            "not include",
            "no record",
            "not available",
            "non esiste",
            "non risulta",
            "non e' presente",
            "non è presente",
        )
    )
    return names_it and negates


def _grade(case: EvalCase, status: int, body: dict, latency_s: float) -> tuple[str, str]:
    if status != 200:
        return "wrong", f"http {status}"
    try:
        answer = body["answer"]
        sources = body["sources"]
        verticale = body["verticale"]
    except KeyError as e:
        return "wrong", f"missing key {e}"
    if not isinstance(answer, str) or not answer.strip():
        return "wrong", "empty answer"
    if not isinstance(sources, list):
        return "wrong", "sources not list"
    if verticale not in get_args(Verticale):
        return "wrong", f"invalid verticale {verticale!r}"
    if latency_s > 30.0:
        return "wrong", f"latency {latency_s:.1f}s > 30s"

    answer_low = answer.lower()
    bad_paths = [
        p for p in sources
        if not isinstance(p, str) or not (_BACKEND / p).is_file()
    ]

    if case.is_trap:
        if _surfaces_false_premise(answer, case.expected_keywords):
            return "pass", "trap: false-premise surfaced"
        if _is_abstention(answer):
            return "abstain", "trap: clean abstention"
        return "wrong", "trap: confident reply (likely fabrication)"

    if _is_abstention(answer):
        return "abstain", "abstention"

    v_match = (verticale == case.expected_verticale)
    k_match = (not case.expected_keywords) or any(
        k.lower() in answer_low for k in case.expected_keywords
    )
    src_note = f"; {len(bad_paths)} bad source paths" if bad_paths else ""
    if v_match and k_match:
        return "pass", "v+k match" + src_note
    if v_match or k_match:
        return "partial", f"v={v_match} k={k_match}{src_note}"
    return "wrong", "no v/k match" + src_note


# --- Runner --------------------------------------------------------------


def run_eval(base_url: str | None = None) -> dict:
    use_http = base_url is not None
    print(f"# Eval mode: {'HTTP ' + base_url if use_http else 'in-process (TestClient)'}")
    print(f"# Cases: {len(ALL_CASES)}")
    results: list[dict] = []
    for case in ALL_CASES:
        try:
            if use_http:
                status, body, latency = _post_via_http(base_url, case.question)  # type: ignore[arg-type]
            else:
                status, body, latency = _post_via_testclient(case.question)
            err: str | None = None
        except (HTTPError, URLError) as e:
            status, body, latency, err = 0, {}, 0.0, f"{type(e).__name__}: {e}"
        except Exception as e:  # noqa: BLE001
            status, body, latency, err = -1, {}, 0.0, f"{type(e).__name__}: {e}"

        if err:
            verdict, note = "wrong", err
        else:
            verdict, note = _grade(case, status, body, latency)

        results.append({
            "qid": case.qid,
            "verdict": verdict,
            "note": note,
            "latency_s": round(latency, 2),
            "verticale_returned": (body or {}).get("verticale"),
            "n_sources": len((body or {}).get("sources", [])),
        })
        print(
            f"  {case.qid:>3} [{case.language}/{case.category:>13}] "
            f"{verdict:>7}  {latency:.2f}s  v={results[-1]['verticale_returned']}  -- {note}"
        )

    counts = {"pass": 0, "partial": 0, "abstain": 0, "wrong": 0}
    for r in results:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    score = 10 * counts["pass"] + 5 * counts["partial"] + 0 * counts["abstain"] + (-15) * counts["wrong"]
    print(
        f"\n# Total: pass={counts['pass']}  partial={counts['partial']}  "
        f"abstain={counts['abstain']}  wrong={counts['wrong']}"
    )
    print(f"# Score (n={len(results)}): {score}")
    return {"results": results, "counts": counts, "score": score, "n": len(results)}


def write_eval_md(report: dict, out_path: Path, *, mode_label: str) -> None:
    lines = [
        "# EVAL.md — /ask test bank",
        "",
        f"Mode: **{mode_label}** · Run at: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "| qid | category | lang | verdict | latency | verticale | sources | note |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in report["results"]:
        case = next(c for c in ALL_CASES if c.qid == r["qid"])
        lines.append(
            f"| {r['qid']} | {case.category} | {case.language} | {r['verdict']} | "
            f"{r['latency_s']}s | {r['verticale_returned']} | {r['n_sources']} | "
            f"{r['note'].replace('|', '\\|')} |"
        )
    c = report["counts"]
    n = report["n"]
    lines += [
        "",
        f"## Summary (n={n})",
        f"- pass: **{c['pass']}**",
        f"- partial: **{c['partial']}**",
        f"- abstain: **{c['abstain']}**",
        f"- wrong: **{c['wrong']}**",
        f"- score (this bank): **{report['score']}**",
        "",
        "## Notes",
        "- The official Level-1 evaluator uses an LLM judge that is more nuanced",
        "  than this heuristic. Treat scores as a **directional signal**, not a",
        "  literal predictor.",
        "- For traps, surfacing the false premise scores as `pass`; clean",
        "  abstention scores as `abstain` (0 points). Confident reply = `wrong`.",
        "- Source-path existence is checked against `backend/data/`. If a path",
        "  appears in `sources[]` that does not exist on disk, the verdict is",
        "  downgraded with a `bad source paths` note.",
    ]
    out_path.write_text("\n".join(lines))


if __name__ == "__main__":
    base = os.environ.get("BUDDY_API_URL")
    rep = run_eval(base)
    label = f"HTTP {base}" if base else "in-process (TestClient)"
    write_eval_md(rep, _REPO_ROOT / "EVAL.md", mode_label=label)
    print(f"# EVAL.md written to {_REPO_ROOT / 'EVAL.md'}")
