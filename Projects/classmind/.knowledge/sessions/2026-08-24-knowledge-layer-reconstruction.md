---
status: Draft
created: 2026-08-30
updated: 2026-08-30
---

# 2026-08-24 — The knowledge layer: reconstruct what a lecture meant, not which sentences looked interesting

**Present:** Shyam (writing machine), Claude (engineering partner)

> **This log was written on 2026-08-30, six days after the session it describes.** The 2026-08-24
> session ended without one. It is reconstructed from commit `f0fc84e`, its message, and the code
> it introduced. The commit message is detailed and states its own verification, so the account of
> *what was built* is good.
>
> Two things this log says were **not known on 2026-08-24 and are marked as found later**: the
> two silent test breakages under "Mistakes hit". They are recorded here rather than only in the
> 2026-08-30 entry because this is the session that introduced them, and a reader tracing the
> defect back needs to land here.
>
> Everything under "Decisions made" is inferred from code. No `../decisions.md` entry was written.

## Starting state

The 2026-08-22 evening work was two days old and unrecorded — no session log, no `progress.md`
entry. The extractor could see teaching as well as actions, `/api/lectures/[id]/taught` answered
from stored knowledge, and the product was deployed and running on `bom1`.

The open defect carried in was the wrong-language transcript, reproduced on a live call on
2026-08-22 with all three guards demonstrated silent. **This session did not address it** — it is
untouched by `f0fc84e`.

## Work done

### The problem: a sentence cannot hold an assignment

In the reference lecture one assignment spans **four sentences over 45 seconds**, and the fourth —
*"vo project ko cloud pe deploy karna hai"* — is only interpretable given the third. A single-span
`extraction_candidates` row cannot hold that shape, so the product emitted **two unrelated
assignments instead of one**. This is reference resolution, and no additional pattern matching
reaches it, because the information needed is not in any one of the sentences.

### Three layers on top of the candidates — candidates are not replaced

Candidates remain the immutable **Layer 1** record and the baseline any future extraction method
is compared against. That is deliberate: replacing them would destroy the comparison the project
exists to make.

**Layer 2 — `src/lib/reasoning/`.** Reconstructs items from a bounded window around one candidate
cluster. Three properties make it safe to build on a language model:

- **Bounded input.** The model never sees the whole lecture, only one window, so it cannot pull in
  unrelated material and cannot be steered by something said twenty minutes away.
- **Verified output.** Every quote it returns is checked to occur verbatim in that window, and an
  item with an unverifiable quote is **discarded rather than repaired**. That makes "never invent"
  a property of the pipeline instead of a line in a prompt.
- **Explicit absence.** The schema has a required `unspecified` field. A model asked only for what
  *was* said will fill gaps; a model asked what was **not** said has somewhere to put the gap.

**Layer 3 — `src/lib/knowledge/`.** Stores the result. Knowledge is derived but **not recomputed**:
it costs a model call to produce, it must stay citable months later, and a student asking the same
question twice must get the same answer.

**Review moves from per-sentence to per-item.** Only actionable kinds (`assignment`, `deadline`,
`exam_instruction`) are gated behind a human; topics and concepts go live automatically. A
professor cannot review thirty topics after every lecture, and the cost of being wrong is not
symmetric — a mislabelled topic wastes a moment, a wrong deadline costs a grade.

### Schema and surface

`knowledge_items` + `knowledge_evidence`, many spans per item — which is the entire point of the
second table. Migration `20260823090000_knowledge_layer.sql` was **already applied to the live
Supabase project** (`kkjyfojcahlopsfpcdbw`), so the deploy needed no migration step.

`CandidateReview` was replaced by `ActionableReview` + `KnowledgeUnit`. `/api/lectures/[id]/taught`
— built two days earlier — was superseded by `/api/lectures/[id]/knowledge`. `AskPanel` and a
rewritten `/api/courses/[id]/ask` landed in the same commit. Two new suites were added:
`npm run test:knowledge` (`scripts/verify-knowledge-pipeline.mts`) and `npm run test:identity`.

`verify-knowledge-pipeline.mts` is worth naming for its design: it runs two regressions — the real
college lecture already in the system, and a lecture the pipeline has never seen (Class-12 physics,
Devanagari Hindi, different lecturer, different subject) — on the stated reasoning that *if a
change helps A but not B, it was a lecture-specific hack and does not belong in the pipeline*. It
makes real transcription and real reasoning calls and therefore costs money, which the script
argues is the point.

### What was verified

The commit states: `next build` clean across all 24 routes, `eslint` clean. **That is the whole
list.** `npm run test:e2e` was not among it, and the consequence is the first item under "Mistakes
hit".

## Decisions made

**No entries were added to [`../decisions.md`](../decisions.md).** Three choices are visible in the
code and are recorded here as **inferred**, not as decisions on file:

1. **Layer 1 is kept as an immutable baseline rather than replaced by Layer 2.** The comparison
   between extraction methods is the capstone's research contribution; keeping candidates is what
   protects it.
2. **Verification is structural, not instructional.** "Never invent" is enforced by discarding
   items whose quotes do not appear verbatim in the window, rather than by asking the model not to.
   This is the most reusable idea in the commit and has no written decision behind it.
3. **Automatic publication for teaching, human gate for actionable**, on asymmetric error cost.
   This changes who is accountable for what a student reads and is a policy choice, not an
   implementation detail. It belongs in `decisions.md`.

## Learnings captured

**None.** No `AI-Memory/Inbox/` entry was written. Captured belatedly on 2026-08-30 in
`AI-Memory/Inbox/classmind/2026-08-30T1108Z-transcript-guard-and-mvp-sprint/`.

## Mistakes hit

Both of these were **invisible on 2026-08-24 and were found on 2026-08-30**. Neither is a mistake
of reasoning; both are the same mechanical mistake — an API response key was renamed and the suite
that reads it was not run.

- **`scripts/e2e.mts` has been aborting since this commit.** The rewritten `/api/courses/[id]/ask`
  returns `sources`; the suite still reads `ask.json.items`. On a run where the ask *succeeds*,
  `ask.json.items.length` throws a `TypeError`, `main().catch` swallows it into a one-line failure,
  and **17 of the suite's 64 checks never execute**. Three whole sections have not run since:
  *"15-16. Evidence and the source timestamp"*, *"24. No unverified information reaches students"*,
  and *"Course Context did not contaminate the transcription layer"*. The suite fails in exactly
  the case where the product works, which is why it does not read as a product bug.
- **The duplicate-processing check can no longer pass.** This commit removed `skipped: true` from
  the extract route's response — correctly, because with Layer 2 present a re-run legitimately does
  work. The suite still asserts `again.json?.skipped === true`, so the one check covering
  "re-running the same method does not duplicate" now asserts a key the route never returns.
- **No session log and no `progress.md` entry**, for the third consecutive session. This is the
  cause of the two items above, not a separate failing: had either later session re-run the suite,
  or had the record forced anyone to look, the breakage was a two-line fix on the day.

## Ending state

The knowledge layer exists and is deployed. A lecture is read as items with multiple pieces of
evidence rather than as a list of interesting sentences. The migration is applied to the live
project. `next build` and `eslint` pass.

**Unverified end to end.** The end-to-end suite was not run, and (found later) could not have
completed if it had been.

Still untouched: the wrong-language transcript defect, lecture `5ced44b6`'s foreign transcript, and
the absence of a consent mechanism.

## Next session should start with

Running `npm run test:e2e` against the rewritten routes, and writing the three missing session
logs.

*(Neither happened. The 2026-08-26 session changed `reconstruct.ts` and also left no record; the
suite was not run again until 2026-08-30, which is when the breakage was found.)*
