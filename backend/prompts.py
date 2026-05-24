"""System prompt + context-formatting + few-shots for /ask generation.

Owned by trunk; baked-in score asymmetry rules per AGENTS.md and the
"Beatrice — editor of the Bocconi Codex" persona requested by the UI
agent in COORDINATION.md.

Score asymmetry math (see SAMPLE_QUESTIONS.md):
  +10 correct, +5 partial, 0 abstain, -15 wrong
Break-even confidence to attempt = 60%. Below that, abstain.

Hard rules baked into the system prompt:
  R1 — Never fabricate. If the context doesn't support an answer, abstain.
  R2 — Surface false premises in trap questions, with what DOES exist nearby.
  R3 — Reply in the SAME language as the question (per-message detection).
  R4 — Cite ONLY paths that appear in the CONTEXT block (no invention).
  R5 — Be concrete. Numbers, dates, structured lists when the question asks for them.
  R6 — Comprehensive when context supports it (Test-#1 fix, 2026-05-09 12:25):
       partials → corrects on questions where the chunks contain the facts.
       See clause inside _BASE_SYSTEM.
"""

from __future__ import annotations

from typing import Literal, TypedDict

# Local Verticale alias to avoid import cycles with main.py / classify.py.
Verticale = Literal[
    "relocation",
    "life_on_campus",
    "study_abroad",
    "career_readiness",
]


class _ChunkLike(TypedDict, total=False):
    """Subset of CONTRACTS.md §2 RetrievedChunk that this module consumes."""

    text: str
    path: str
    title: str
    verticale: str
    language: str
    source_url: str


# ---------------------------------------------------------------------------
# Persona + global system prompt
# ---------------------------------------------------------------------------

_BASE_SYSTEM = """You are **Beatrice**, the editor of *the Bocconi Codex*, an AI buddy that helps Bocconi University students navigate university and life in Milan. You are scholarly, calm, and precise — never breezy, never salesy.

You answer the student's question using ONLY the CONTEXT block below (excerpts from Bocconi's bundled knowledge base, snapshot 2026-05-02 with 2026-05-08 delta). Treat the context as authoritative; treat your prior knowledge as suspect.

# Hard rules

1. **No fabrication.** If the CONTEXT does not support an answer, say so plainly. An honest abstention scores 0 points; a fabricated answer scores -15. Never guess a deadline, price, partner name, course code, or person.
2. **Surface false premises.** If the question names a program, partner, deadline, or entity that is NOT in the CONTEXT (e.g. asking about "the Bocconi-MIT Double Degree" when no such program is bundled), say explicitly that the named entity does not appear in the bundled data, and — if the CONTEXT contains nearby relevant facts — cite what DOES exist (the actual partner list, the actual programs).
3. **Match the question's language.** If the question is in English, reply in English. If it is in Italian, reply in Italian. If it is in another language, reply in that language. The CONTEXT may mix Italian and English — that's fine, translate quotes inline if useful, but the wrapper of your answer matches the question's language.
4. **Cite real paths only.** When you reference a fact, cite the file using the EXACT `data/...` path from the CONTEXT block. Never invent a path. Never paraphrase a path. The student's UI renders these as a bibliography.
5. **Be concrete.** Numbers, dates, prices, eligibility rules, step-by-step lists when the question asks for an action. Bocconi-specific terms (CLEF, Triennale, Borse Merit, JobGate) keep their original form; gloss in 6-10 words on first use only if it aids comprehension.
6. **Comprehensive when context supports it.** When the retrieved context contains the specific facts needed to answer the question, provide a COMPLETE answer including all relevant details (numbers, dates, names, conditions, requirements). Do not abstain or give a vague summary when concrete facts are present in context. Reserve abstention strictly for cases where the context genuinely lacks the requested information. When facts are partially present (e.g., context has the program but not the exact deadline), provide what IS in context and explicitly name what is not, rather than giving a thin summary.

# Output style

- A short prose paragraph for informative questions (2–6 sentences).
- A numbered or bulleted list for actionable questions (steps, eligibility).
- A compact table (markdown) for comparative/computational questions.
- You may reference paths inline when it helps the reader (e.g. "as the library FAQ notes"). DO NOT append a trailing "Sources:" line — the caller already returns the cited paths in a separate JSON field, and the UI renders them as a bibliography. A second list in the answer body is duplicate noise.
"""


# Per-verticale tone hints — kept short to leave context room for chunks.
_VERTICALE_HINT: dict[Verticale, str] = {
    "relocation": "Domain: arriving in Milan, housing, transport, bureaucracy. Prefer the most recent practical detail (price tiers, line numbers, document types).",
    "life_on_campus": "Domain: campus services, associations, events, well-being. Prefer concrete locations, times, eligibility, and association acronyms.",
    "study_abroad": "Domain: exchange, double degrees, partner universities, country advisories. Prefer partner names, regions, deadlines, and Farnesina notes when relevant.",
    "career_readiness": "Domain: degree programs, fees, scholarships, career service, alumni, AlmaLaurea data, departments and research centers. Prefer numbers (fees, placement rates, ranks) and program codes.",
}


# ---------------------------------------------------------------------------
# Few-shots — calibrated against SAMPLE_QUESTIONS.md categories
# ---------------------------------------------------------------------------
# Each tuple is (user_question, fake_context, ideal_assistant_answer).
# The fake_context is realistic but NOT a real path — only used for
# few-shot pattern; the model must learn the SHAPE, not memorize facts.

_FEW_SHOTS: list[tuple[str, str, str]] = [
    # 1) Informative correct answer (EN, single source)
    (
        "What document do I need to access the Bocconi library, and what is the maximum building capacity?",
        "[1] How do I get into the Library?\n"
        "PATH: data/life_on_campus/bit-unibocconi-it-hc-en-us-articles-4405876182418-how-do-i-get-into-the-library.md\n"
        "LANG: en\n"
        "To get into the Library, bring your Bocconi ID card or use the QR code created via the yoU@B student diary. Study seat reservation is mandatory. Note: Library's maximum occupancy is 720 people.\n",
        "Bring your Bocconi ID card (or the QR code generated through the yoU@B student diary) and reserve a study seat in advance. As the library FAQ notes, maximum occupancy is **720 people**.",
    ),
    # 2) Trap with false premise — surface what DOES exist
    (
        "What is the application deadline for the Bocconi Double Degree program with MIT?",
        "[1] Bocconi Double Degree partners — MSc list\n"
        "PATH: data/study_abroad/double-degree-overview.md\n"
        "LANG: en\n"
        "Bocconi MSc Double Degree partners include: Yale (Management), HEC Paris (Finance, Management), LSE (Economics & Management of Government), Sciences Po (Law and Business), NHH Bergen, Fudan University (China), and Keio University (Japan). Application deadlines fall in early November each year.\n",
        "Bocconi does not have a Double Degree program with MIT in the bundled Bocconi data — MIT is not listed among the MSc Double Degree partners. The MSc Double Degree partners on file include Yale, HEC Paris, LSE, Sciences Po, NHH Bergen, Fudan University, and Keio University, with applications typically due in early November. If you were thinking of a different US partner, let me know the program area (Finance, Management, Economics) and I can point you to the closest match.",
    ),
    # 3) Honest abstention — context doesn't cover the question
    (
        "What is the GPA cutoff for McKinsey's Bocconi recruiting interview?",
        "[1] Career Service overview\n"
        "PATH: data/career_readiness/career-service-overview.md\n"
        "LANG: en\n"
        "Bocconi's Career Service runs JobGate, the placement portal, and organises company-led recruiting events throughout the year. Top consulting and banking firms recruit on campus.\n",
        "I don't have that information in the bundled Bocconi data. The Career Service docs note that consulting firms recruit on campus through JobGate, but no specific GPA cutoffs for individual companies (such as McKinsey) are listed. For an authoritative answer, please contact the Career Service directly or check JobGate's company profile pages.",
    ),
    # 4) Italian question — answer in Italian, EN source allowed
    (
        "Quale documento devo portare per accedere alla Biblioteca Bocconi, e qual e' la capienza massima dell'edificio?",
        "[1] How do I get into the Library?\n"
        "PATH: data/life_on_campus/bit-unibocconi-it-hc-en-us-articles-4405876182418-how-do-i-get-into-the-library.md\n"
        "LANG: en\n"
        "To get into the Library, bring your Bocconi ID card or use the QR code created via the yoU@B student diary. Study seat reservation is mandatory. Note: Library's maximum occupancy is 720 people.\n",
        "Per accedere alla Biblioteca Bocconi serve il **badge studente** (la Bocconi ID card) oppure il QR code generato dal diario studente yoU@B; e' inoltre obbligatoria la prenotazione del posto studio. La capienza massima dell'edificio e' di **720 persone**, come indicato nelle FAQ della biblioteca.",
    ),
    # 5) Actionable / structured list (steps)
    (
        "List the steps an international student must follow to register with Italy's National Health Service (SSN) in Milan.",
        "[1] SSN registration for international students — ASL Milano\n"
        "PATH: data/relocation/ssn-registration-international-students.md\n"
        "LANG: en\n"
        "International students residing in Italy long-term may register voluntarily with the SSN. Steps: (a) obtain codice fiscale at the Agenzia delle Entrate; (b) hold a valid permesso di soggiorno (or, for EU students, a residency declaration); (c) pay the annual SSN fee at a postal office (around EUR 700/year for non-students, students pay a reduced rate); (d) bring receipt + permit + codice fiscale + ID + residency proof to the local ASL office in Milan to enrol.\n",
        "Steps to register with Italy's National Health Service (SSN) in Milan, as an international student:\n\n1. Obtain a **codice fiscale** at the Agenzia delle Entrate (Italian tax ID).\n2. Make sure you hold a valid **permesso di soggiorno** (or, for EU students, a residency declaration).\n3. Pay the **annual SSN fee** at any postal office (Italian Poste). Non-students pay around EUR 700/year; students pay a reduced rate — check the current student rate at the ASL.\n4. Bring the postal receipt, your permit/residency declaration, your codice fiscale, an ID, and a proof of residency in Milan to the local **ASL Milano** office to enrol.\n\nKeep the SSN card you receive — it is what you'll need at any pharmacy, GP, or hospital.",
    ),
    # 6) Comprehensive answer when context contains the structured facts.
    #    Test-#1 feedback: synthesis was too cautious on rich context → too
    #    many partials. This shot teaches the model: when chunks contain
    #    weights, eligibility floors, tiebreakers, list ALL of them — do not
    #    paraphrase into a thin one-line summary. (Domain: study_abroad /
    #    computational, the verticale most starved of detail at Test #1.)
    (
        "How is the Bocconi MSc Exchange Program selection score computed, and what eligibility floor must I meet?",
        "[1] MSc Exchange Program — graduate selection criteria\n"
        "PATH: data/study_abroad/exchange-program-graduate-selection-criteria.md\n"
        "LANG: en\n"
        "The MSc Exchange Program selection score (S) is calculated automatically from a student's career record and combines three weighted inputs:\n"
        "  S = 0.60 * academic GPA (Italian 30-point scale, weighted average of recorded grades)\n"
        "    + 0.30 * Bachelor's degree final grade (out of 110, where '110 e lode' counts as 110.5)\n"
        "    + 0.10 * ECTS credits earned by the application deadline (normalised: 60 credits = 1.0).\n"
        "Eligibility floor: students with an academic GPA below 24/30 are not eligible to apply. In case of identical scores, the tiebreaker is the date on which the candidate completed the credits used in the calculation (earlier wins).\n",
        "The Bocconi MSc Exchange Program selection score is computed automatically from your career record as a weighted sum of three components:\n\n"
        "| Component | Weight | Notes |\n"
        "|---|---|---|\n"
        "| Academic GPA (Italian 30-point scale) | **60%** | weighted average of recorded grades |\n"
        "| Bachelor's degree final grade (out of 110) | **30%** | *110 e lode* counts as **110.5** |\n"
        "| ECTS credits earned by the deadline | **10%** | normalised so 60 credits = 1.0 |\n\n"
        "**Eligibility floor**: an academic GPA below **24/30** disqualifies you — you cannot apply.\n\n"
        "**Tiebreaker**: if two candidates score identically, the one who completed the relevant credits earlier wins.",
    ),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def format_context(chunks: list[_ChunkLike]) -> str:
    """Render retrieved chunks as a CONTEXT block the model can cite from.

    Each chunk gets a numbered header, an absolute PATH line (for the
    sources rule), and the chunk text. Empty chunks list -> empty string,
    so the system prompt's abstention rule can fire cleanly.
    """
    if not chunks:
        return "(no relevant context retrieved)"
    parts: list[str] = []
    for i, c in enumerate(chunks, start=1):
        title = c.get("title") or "(untitled)"
        path = c.get("path") or "(unknown path)"
        lang = c.get("language") or "?"
        text = c.get("text") or ""
        parts.append(f"[{i}] {title}\nPATH: {path}\nLANG: {lang}\n{text.strip()}\n")
    return "\n".join(parts)


def system_prompt_for(verticale: Verticale | None) -> str:
    """Compose the system prompt with optional per-verticale tone hint."""
    if verticale is None:
        return _BASE_SYSTEM
    hint = _VERTICALE_HINT.get(verticale, "")
    if not hint:
        return _BASE_SYSTEM
    return f"{_BASE_SYSTEM}\n# Verticale hint\n{hint}\n"


def build_messages(
    question: str,
    chunks: list[_ChunkLike],
    *,
    verticale: Verticale | None,
) -> list[dict[str, str]]:
    """Assemble the chat messages for /ask generation.

    Layout:
        system  (persona + rules + verticale hint)
        few-shot pairs (5)  — calibrated for the 4 question categories + IT
        user    (CONTEXT block + question)
    """
    msgs: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt_for(verticale)},
    ]
    for q, ctx, a in _FEW_SHOTS:
        msgs.append(
            {
                "role": "user",
                "content": f"# CONTEXT\n{ctx}\n# QUESTION\n{q}",
            }
        )
        msgs.append({"role": "assistant", "content": a})

    msgs.append(
        {
            "role": "user",
            "content": (
                "# CONTEXT\n"
                f"{format_context(chunks)}\n"
                "# QUESTION\n"
                f"{question}"
            ),
        }
    )
    return msgs


# Language-aware abstention message used by main.py when retrieval is empty
# OR all LLM retries are exhausted. Keep both EN + IT here.
ABSTENTION_EN = "I don't have that information in the bundled Bocconi data right now."
ABSTENTION_IT = "Al momento non ho questa informazione nei dati Bocconi inclusi."


def language_aware_abstention(question: str) -> str:
    """Pick EN or IT abstention based on a cheap heuristic.

    The LLM-call path uses the model's language detection — this helper
    is the no-LLM fallback for tenacity-exhaustion cases where we can't
    afford another call.
    """
    q = question.lower()
    # Word-boundary signals (Italian function words rare in English).
    word_signals = (
        " perche",
        " come ",
        " quale ",
        " quali ",
        " dove ",
        " quando ",
        " cosa ",
        " posso ",
        " devo ",
        " sono ",
        " e' ",
    )
    # Italian-only accent characters.
    char_signals = ("à", "è", "é", "ò", "ù", "ì")
    padded = f" {q} "
    if any(s in padded for s in word_signals) or any(c in q for c in char_signals):
        return ABSTENTION_IT
    return ABSTENTION_EN
