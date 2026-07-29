---
project: classmind
session_id: 2026-07-29T1432Z-asr-model-selection
schema_version: 1
generated_by: End-Session/1.0.0
generated_at: 2026-07-29T14:32:07Z
---

# 2026-07-29 — ASR model selection

## Starting state

Architecture drafted but the speech-recognition layer was unresolved — `architecture.md`
listed it as "TBD: Whisper variant". Two candidates on the table (Whisper large-v3,
IndicWhisper) and no data to choose between them. Open blocker carried in from the previous
session.

## What was done

Recorded and hand-transcribed 40 minutes of real lecture audio from three lecturers to serve
as ground truth, then ran both models against it. Split the results by segment type —
monolingual Hindi, monolingual English, and code-switched — rather than reporting a single
aggregate word error rate, which is what made the difference visible.

Wrote up the comparison in `benchmarks/asr-comparison.md`, recorded the decision in
`decisions.md`, and replaced the "TBD" in `architecture.md`. Deleted `scratch-asr-notes.md`,
now superseded by the benchmark write-up.

## Decisions made

**Whisper large-v3 over IndicWhisper.** IndicWhisper wins on pure Hindi and loses badly on
code-switched segments, which are the majority of our real input. Full rationale, alternatives
and trade-offs in `.knowledge/decisions.md`.

The cost is real: large-v3 is slower and needs more VRAM, which likely pushes us to batch
processing rather than near-real-time. Accepted rather than solved.

## Problems hit

The first benchmark run reported IndicWhisper as the clear winner — because it was scoring a
single aggregate word error rate across all audio, and the monolingual segments outnumbered
the code-switched ones. The aggregate hid exactly the thing we were trying to measure.

Re-ran with results split by segment type and the picture inverted. Worth remembering: an
average across mixed populations can answer a question you did not ask.

## Unresolved questions

The benchmark drew on three lecturers from one department. Code-switching density varies by
individual, subject and institution, so if this sample is unusually dense the measured gap may
not generalise — and the model choice rests on it. Needs audio from a wider set of lecturers
before the decision is settled rather than provisional. Tracked as `cand-003`.

## Ending state

ASR layer decided and documented; `architecture.md` no longer has an open TBD in that section.
Benchmark harness exists and is re-runnable against new audio. Working tree clean, all work
pushed.

## Next session should start with

Widening the benchmark sample — more lecturers, ideally a second department — to confirm the
code-switching gap holds. Until that lands, treat the model choice as provisional and avoid
building anything that would be expensive to change if it flips.

---

**Inbox entry:** `AI-Memory/Inbox/classmind/2026-07-29T1432Z-asr-model-selection/`
**Candidates:** 3 (1 learning, 1 decision, 1 open question)
**Commits:** `4c43abc..a126882`
