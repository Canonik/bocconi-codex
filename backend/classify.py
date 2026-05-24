"""Verticale classifier for /ask.

Single zero-shot LLM call (gpt-5.4-nano via `chat_small`) returning a
4-class structured output. Per CONTRACTS.md §4:
  - signature: classify_verticale(question) -> tuple[Verticale, float]
  - latency budget: <= 500ms
  - MUST NOT raise; on error returns ("life_on_campus", 0.0)
  - caller passes verticale=None to retrieve() when confidence < 0.5
"""

from __future__ import annotations

import json
import logging
from typing import Literal, get_args

from openai import APIConnectionError, APITimeoutError, InternalServerError, RateLimitError

from llm import chat_small

logger = logging.getLogger("buddy.classify")

# Duplicated from main.py on purpose — Literal types compose structurally.
# If/when we extract a shared `_types.py`, both definitions collapse into one.
Verticale = Literal[
    "relocation",
    "life_on_campus",
    "study_abroad",
    "career_readiness",
]

_DEFAULT: tuple[Verticale, float] = ("life_on_campus", 0.0)

_SYSTEM_PROMPT = """You classify a Bocconi student's question into ONE of four verticali.

- relocation: housing in Milan, visa, codice fiscale, transport (ATM, Malpensa, Linate), banks, SSN/healthcare, SIM, neighborhoods, cost of living.
- life_on_campus: dining/library/sport/well-being on campus, student associations (BSIC, BSAMC, etc.), events, campus news, free things to do in Milan.
- study_abroad: exchange programs, double degrees, partner universities, summer schools, country advisories (Farnesina), incoming-exchange info.
- career_readiness: degree programs (BSc/MSc/PhD) and curricula, Career Service, internships, scholarships (Merit, ISU), alumni, faculty and research centers, AlmaLaurea data, fees, Open Days, departments.

Reply with a JSON object EXACTLY: {"verticale": "<name>", "confidence": <0.0-1.0>}

Confidence:
- 0.9+ : clear keyword match for one verticale only (e.g. "ATM pass", "MSc Finance fees", "Erasmus partner")
- 0.6-0.89 : dominant verticale with minor cross-cutting elements
- <0.6 : ambiguous or could fit 2+ verticali

If unsure, prefer "life_on_campus" with low confidence.
"""

_FEW_SHOTS: list[tuple[str, str]] = [
    (
        "What is the price of an annual ATM transit pass for students under 27?",
        '{"verticale": "relocation", "confidence": 0.95}',
    ),
    (
        "Provide a structured table of the dining areas available on the Bocconi campus.",
        '{"verticale": "life_on_campus", "confidence": 0.95}',
    ),
    (
        "Quali universita' offrono un double degree in Finance con Bocconi?",
        '{"verticale": "study_abroad", "confidence": 0.95}',
    ),
    (
        "What is the maximum amount of the Bocconi Merit Award tuition waiver for MSc students?",
        '{"verticale": "career_readiness", "confidence": 0.92}',
    ),
    (
        "Where is the Bocconi library and how do I get in?",
        '{"verticale": "life_on_campus", "confidence": 0.88}',
    ),
]


def _build_messages(question: str) -> list[dict[str, str]]:
    msgs: list[dict[str, str]] = [{"role": "system", "content": _SYSTEM_PROMPT}]
    for q, a in _FEW_SHOTS:
        msgs.append({"role": "user", "content": q})
        msgs.append({"role": "assistant", "content": a})
    msgs.append({"role": "user", "content": question})
    return msgs


def classify_verticale(question: str) -> tuple[Verticale, float]:
    """Classify a question into one of 4 verticali. NEVER raises.

    Returns (verticale, confidence). On any error returns the default
    ("life_on_campus", 0.0); the caller should treat low confidence
    as a signal to do cross-verticale retrieval (`verticale=None`).
    """
    valid = get_args(Verticale)
    try:
        raw = chat_small(
            _build_messages(question),
            response_format={"type": "json_object"},
            temperature=0,
            max_completion_tokens=40,
        )
    except (RateLimitError, APITimeoutError, APIConnectionError, InternalServerError) as e:
        logger.warning("classify: transient openai error %s: %s — defaulting", type(e).__name__, str(e)[:200])
        return _DEFAULT
    except Exception as e:  # noqa: BLE001 — last-resort: never raise to caller
        logger.warning("classify: unexpected error %s: %s — defaulting", type(e).__name__, str(e)[:200])
        return _DEFAULT

    try:
        data = json.loads(raw)
        v = data.get("verticale")
        c_raw = data.get("confidence", 0.0)
        if v not in valid:
            logger.warning("classify: model returned invalid verticale %r — defaulting", v)
            return _DEFAULT
        try:
            c = float(c_raw)
        except (TypeError, ValueError):
            c = 0.0
        return (v, max(0.0, min(1.0, c)))
    except (json.JSONDecodeError, AttributeError, TypeError):
        logger.warning("classify: model returned unparseable output %r — defaulting", raw[:80])
        return _DEFAULT
