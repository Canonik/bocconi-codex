# Pitch Talking Points

## One-Sentence Pitch

Bocconi Codex is a source-backed AI buddy that helps Bocconi students solve real university-life questions, and it knows when not to guess.

## Opening

Students do not ask university questions in neat categories. They ask: "Can I afford this neighborhood?", "Which double degree fits Finance?", "How do I enter the library?", "What does this scholarship actually cover?"

Bocconi Codex gives them one calm place to ask. Beatrice reads the Bocconi archive, answers in the student's language when the signal is clear, and shows the source paths behind the answer.

## Demo Flow

1. Open the frontend and point out the four areas: Milan, campus, study abroad, career.
2. Click a sample question so judges see that it is immediately usable.
3. Show the answer as an article, not a raw chat bubble.
4. Point to the bibliography: every answer carries real source paths.
5. Ask the ATM under-27 annual pass question. Beatrice should answer EUR 200 and cite the new ATM source.
6. Ask the Graduate Merit Award question. Beatrice should say it is a 100% tuition-and-fees waiver, not a stipend.
7. Ask the MIT Double Degree trap. Beatrice should say the program is not in the data, then give the real double-degree timeline.
8. Open the Resources drawer and show the curated links plus the satellite-style Bocconi area map.

## What Makes It Strong

- It covers all four required verticals.
- It is honest under pressure. Pre-test #1 had zero wrong answers.
- It is fast enough for the 30-second evaluator budget.
- It cites sources as a first-class part of the interface.
- It has a distinct product shape: an editorial reading room, not a generic chat wrapper.
- It now includes targeted extra coverage for concrete gap questions: ATM fares, Milan arrival bureaucracy, dining detail, and Graduate Merit Awards.

## Technical Explanation In Plain Language

Before answering, Beatrice searches a local Bocconi archive of 9,720 indexed chunks. The app first detects which student-life area the question belongs to, retrieves the most relevant passages, then asks the model to answer only from those passages. If the passages do not contain the answer, Beatrice refuses instead of inventing.

The evaluator sees a simple endpoint: `POST /ask`. It returns exactly three things: the answer, the sources, and the vertical.

## Current Score Story

The first platform pre-test scored **140/160 with 0 wrong answers**. That was the right foundation: no fabrication.

The current deployed build keeps that safety floor and adds two upgrades:

- richer synthesis when the source material supports a detailed answer;
- extra indexed data for the known gaps, especially ATM fares and Merit Awards.

The deployed HTTP test bank is currently **19 pass, 1 partial, 0 abstain, 0 wrong**, score **195/200**. It is not the official evaluator, but it is the best regression signal before Test #2.

## If Judges Ask About Limitations

The main limitation is still coverage: Beatrice only knows what is in the indexed archive. That is intentional. When the archive is thin, the product should be cautious instead of confident.

There is also a small language edge case: a very short English query over Italian-only sources can occasionally receive an Italian answer. Full English questions in the same topic answer in English correctly.

## Closing

Bocconi Codex is built around a simple promise: useful when it knows, honest when it does not. That is what students need from an AI buddy they might actually trust.
