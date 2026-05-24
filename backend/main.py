"""Bocconi AI Buddy — backend entry point.

Implements POST /ask: a RAG pipeline over the bundled Bocconi data,
returning a grounded answer with cited source paths.

See AGENTS.md for the public spec, CONTRACTS.md §1 for the frozen
schema, and prompts.py for the system prompt + few-shots.

Slice 2: wired to classify → retrieve → generate. If `retrieval.py`
hasn't been committed by the data agent yet, an ImportError fallback
keeps /ask returning schema-valid 200 abstentions (0 points beats -15).
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import APIError, APITimeoutError, RateLimitError
from pydantic import BaseModel, Field

# Slice-2 modules (trunk-owned)
from classify import classify_verticale
from llm import chat
from prompts import build_messages, language_aware_abstention

# Slice-2 module (data-agent-owned). If not yet committed, the
# fallback keeps /ask functional with empty retrieval so the model
# either abstains cleanly (preferred) or surfaces the false-premise rule.
try:
    from retrieval import retrieve  # type: ignore[import-not-found]

    _RETRIEVAL_READY = True
except ImportError:  # pragma: no cover — exercised only before data ships
    _RETRIEVAL_READY = False

    def retrieve(  # type: ignore[no-redef]
        question: str,
        *,
        verticale: str | None = None,
        k: int = 8,
    ) -> list[dict[str, Any]]:
        return []


# Load .env locally; on Railway env vars are already in the process env.
load_dotenv()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("buddy")

app = FastAPI(title="Bocconi AI Buddy")

# CORS: allow the deployed frontend (and localhost during dev) to call /ask.
# Set FRONTEND_URL on Railway to your frontend service's public URL,
# e.g. https://buddy-frontend-yourname.up.railway.app
_allowed = [
    o.strip()
    for o in (os.environ.get("FRONTEND_URL") or "*").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


Verticale = Literal[
    "relocation",
    "life_on_campus",
    "study_abroad",
    "career_readiness",
]


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)


class AskResponse(BaseModel):
    answer: str
    sources: list[str]
    verticale: Verticale


# Soft-deadline within the 30s hard cap. If classify+retrieve already
# burned more than this, skip the chat call and abstain — better to
# return 0 points than risk -15.
DEADLINE_SECONDS = 25.0
DEFAULT_VERTICALE: Verticale = "career_readiness"


def _abstain_payload(verticale: Verticale, sources: list[str], question: str) -> dict[str, object]:
    return {
        "answer": language_aware_abstention(question),
        "sources": sources,
        "verticale": verticale,
    }


@app.exception_handler(RequestValidationError)
async def _validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Convert request-validation errors (422) into 200 abstentions.

    Per AGENTS.md: any 4xx/5xx from /ask is scored as -15. The evaluator
    sends well-formed bodies, but the safety net is cheap insurance.
    """
    logger.warning("validation error: %s", exc.errors())
    return JSONResponse(
        status_code=200,
        content={
            "answer": "I don't have that information available right now.",
            "sources": [],
            "verticale": DEFAULT_VERTICALE,
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest) -> AskResponse:
    """Real RAG path: classify → retrieve → generate. Always 200."""
    started = time.monotonic()
    q = request.question
    logger.info("ask: question_len=%d retrieval_ready=%s", len(q), _RETRIEVAL_READY)

    verticale: Verticale = DEFAULT_VERTICALE
    sources: list[str] = []

    try:
        # 1) Classify (≤500ms typical; never raises per CONTRACTS.md §4)
        v, conf = classify_verticale(q)
        verticale = v  # type: ignore[assignment]

        # 2) Retrieve (cross-verticale when classifier is unsure)
        v_filter = verticale if conf >= 0.5 else None
        chunks = retrieve(q, verticale=v_filter, k=8)
        sources = [c.get("path", "") for c in chunks if c.get("path")]

        # If retrieval came up empty, the few-shot abstention pattern
        # in the prompt will dominate the model's reply. Still cheaper
        # to short-circuit and skip the LLM call entirely.
        if not chunks:
            logger.info("ask: empty retrieval — abstaining without LLM call")
            return AskResponse(  # type: ignore[arg-type]
                **_abstain_payload(verticale, [], q),
            )

        # 3) Wall-clock guard before the (expensive) generation step
        elapsed = time.monotonic() - started
        if elapsed > DEADLINE_SECONDS - 5.0:
            logger.warning("ask: classify+retrieve burned %.1fs — abstaining", elapsed)
            return AskResponse(  # type: ignore[arg-type]
                **_abstain_payload(verticale, sources, q),
            )

        # 4) Generate
        # Reasoning-class models (gpt-5.5, gpt-5, o-series) only accept
        # temperature=1.0 AND need bigger max_completion_tokens to leave
        # room for reasoning tokens beyond visible output. Both read from
        # env so model swaps stay single-axis.
        msgs = build_messages(q, chunks, verticale=verticale)
        _temp = float(os.environ.get("OPENAI_TEMP", "0.2"))
        _maxtok = int(os.environ.get("OPENAI_MAXTOK", "600"))
        answer = chat(msgs, temperature=_temp, max_completion_tokens=_maxtok)
        logger.info("ask: ok in %.2fs", time.monotonic() - started)
        return AskResponse(answer=answer, sources=sources, verticale=verticale)

    except (RateLimitError, APIError, APITimeoutError) as e:
        # All tenacity retries (and any sibling fallback) exhausted, OR a
        # permanent OpenAI error (BadRequest/Auth/NotFound) propagated up.
        # AGENTS.md: prefer 0 points (abstain) to -15 (5xx).
        logger.warning("ask: openai error (%s: %s) — abstaining", type(e).__name__, str(e)[:200])
        return AskResponse(  # type: ignore[arg-type]
            **_abstain_payload(verticale, sources, q),
        )
    except Exception as e:  # noqa: BLE001 — last-resort net to keep /ask at 200
        logger.warning("ask: unexpected error (%s: %s) — abstaining", type(e).__name__, str(e)[:200])
        return AskResponse(  # type: ignore[arg-type]
            **_abstain_payload(verticale, sources, q),
        )
