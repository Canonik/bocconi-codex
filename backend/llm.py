"""OpenAI client wrapper for Bocconi Buddy.

Owns model selection, per-call timeouts, tenacity retries, and the
sibling-model fallback chain. Per AGENTS.md, callers MUST translate
final failures into HTTP 200 with an abstention text — never a 5xx.

Models (web-searched 2026-05; revisit on 429):
- generation:        gpt-5.4-mini  ($0.75 / $4.50 per 1M, 400k ctx, multilingual)
- classify / rerank: gpt-5.4-nano  ($0.20 / $1.25 per 1M, low-latency)
- embedding:         text-embedding-3-large  ($0.13 / 1M, 1024d Matryoshka)

Sibling fallback (generation only): gpt-5.4-mini → gpt-5.4 → gpt-5.2.
Older snapshots throttle harder, so we try newer-first.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    InternalServerError,
    OpenAI,
    RateLimitError,
)
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger("buddy.llm")

# History: gpt-5.4-mini → gpt-5.4 (14:55, eval 195/200 max 10.46s) →
# gpt-5.5 (14:57, REVERTED 15:00 — first deployed question >90s,
# kill-switch breached) → gpt-5.4 (15:00, calibrated baseline).
GEN_MODEL: str = os.getenv("OPENAI_GEN_MODEL", "gpt-5.4")
GEN_FALLBACKS: tuple[str, ...] = ("gpt-5.4-mini", "gpt-5.2")
SMALL_MODEL: str = os.getenv("OPENAI_SMALL_MODEL", "gpt-5.4-nano")
EMBED_MODEL: str = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-large")
EMBED_DIM: int = 1024  # Matryoshka truncation, locked by CONTRACTS.md §5

# Per-call timeout. The /ask total budget is 30s (AGENTS.md); we leave
# headroom for retrieval + classification + assembly.
PER_CALL_TIMEOUT: float = 20.0

# Retry only on TRANSIENT errors. BadRequestError, AuthenticationError,
# NotFoundError, etc. are permanent — retrying just wastes the 30s budget.
# `APIError` (the base) is intentionally NOT here for that reason.
_RETRYABLE = (
    RateLimitError,
    APITimeoutError,
    APIConnectionError,
    InternalServerError,
)
# Permanent errors that should propagate up immediately so the /ask handler
# can return a 200 abstention without burning retries.
_PERMANENT = APIError  # any other APIError subclass (BadRequest, etc.)


def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. In dev, copy .env.example to .env and "
            "paste the key generated after redeeming the organizer code on "
            "platform.openai.com. On Railway, set it as a service env var."
        )
    return OpenAI(api_key=api_key, timeout=PER_CALL_TIMEOUT)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(_RETRYABLE),
    reraise=True,
)
def _chat_once(model: str, messages: list[dict[str, Any]], **kwargs: Any) -> str:
    """One model call with tenacity retry. Re-raises retryable errors after 3 tries."""
    resp = _client().chat.completions.create(
        model=model,
        messages=messages,
        **kwargs,
    )
    return resp.choices[0].message.content or ""


def chat(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    **kwargs: Any,
) -> str:
    """Generation call with tenacity retry + sibling-model fallback.

    Walks GEN_MODEL → GEN_FALLBACKS in order. Each model gets 3 retries
    with exponential backoff. Raises the last retryable error if every
    sibling exhausts; the caller is responsible for catching and
    returning HTTP 200 with the abstention text.

    If `model` is provided, fallback is disabled and only that model
    is tried (still with the 3-retry envelope).
    """
    chain: list[str] = [model] if model else [GEN_MODEL, *GEN_FALLBACKS]
    last_err: Exception | None = None
    for m in chain:
        try:
            return _chat_once(m, messages, **kwargs)
        except _RETRYABLE as e:
            logger.warning(
                "model %s exhausted transient retries (%s: %s); trying next sibling",
                m, type(e).__name__, str(e)[:200],
            )
            last_err = e
            continue
        # Permanent errors (BadRequest, Auth, NotFound) propagate immediately —
        # no point trying another sibling, the request itself is wrong.
    assert last_err is not None
    raise last_err


def chat_small(messages: list[dict[str, Any]], **kwargs: Any) -> str:
    """Small/fast model for classification + reranking. No sibling fallback."""
    return _chat_once(SMALL_MODEL, messages, **kwargs)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(_RETRYABLE),
    reraise=True,
)
def embed(text: str, *, model: str | None = None, dimensions: int | None = None) -> list[float]:
    """Embed a single string — used for the user's question at /ask time.

    Build-time corpus embedding should call `embed_batch` instead — batching
    cuts the per-build wall-clock from thousands of HTTP round-trips down
    to dozens, and is gentler on per-org rate limits.
    """
    resp = _client().embeddings.create(
        model=model or EMBED_MODEL,
        input=text,
        dimensions=dimensions or EMBED_DIM,
    )
    return resp.data[0].embedding


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(_RETRYABLE),
    reraise=True,
)
def embed_batch(
    texts: list[str],
    *,
    model: str | None = None,
    dimensions: int | None = None,
) -> list[list[float]]:
    """Embed a list of strings in a single OpenAI request.

    OpenAI's embeddings API accepts up to 2048 inputs per request. The
    practical batch size is bounded by the per-request token cap; for
    chunks of ~600 tokens, a batch of ~64–100 fits comfortably under
    the 8191-token-per-input + ~300k-tokens-per-request limit.

    Returns embeddings in the SAME ORDER as the input texts.
    """
    if not texts:
        return []
    resp = _client().embeddings.create(
        model=model or EMBED_MODEL,
        input=texts,
        dimensions=dimensions or EMBED_DIM,
    )
    # OpenAI guarantees order-preserving response; sort by index defensively.
    items = sorted(resp.data, key=lambda d: d.index)
    return [item.embedding for item in items]
