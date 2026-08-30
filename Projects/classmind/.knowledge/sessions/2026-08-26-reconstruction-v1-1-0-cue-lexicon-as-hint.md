---
status: Draft
created: 2026-08-30
updated: 2026-08-30
---

# 2026-08-26 — Reconstruction v1.1.0: the cue lexicon is a hint, not a gate

**Present:** Shyam (writing machine), Claude (engineering partner)

> **This log was written on 2026-08-30, four days after the session it describes.** The 2026-08-26
> session ended without one. It is reconstructed from two commits — `a5b5c71` ("Auto-save:
> reconstruct.ts", 12:30) and `f81956f` (13:27), which supersedes it and carries the reasoning —
> plus the code they left in `src/lib/reasoning/reconstruct.ts`. Between them the two commits
> change one file by +191/−59 lines.
>
> The commit message is unusually complete, including a measured cost table, so the account of
> *what changed and why* is good. What is **inferred** rather than known: how the ceiling numbers
> were produced (the message reports them as measured, and the code does not show the harness), and
> anything discussed and not committed. Nothing was written to `../decisions.md`.

## Starting state

The knowledge layer from 2026-08-24 was two days old and unrecorded. Reconstruction was at v1.0.0.
The end-to-end suite had been broken since 2026-08-24 and nobody knew, because nobody had run it —
that is stated here from 2026-08-30's knowledge, not from anything visible on the day.

## Work done

### The bug: a word list was the recall ceiling on assignments

Until v1.0.0, Layer 2's actionable pass only ran on windows around sentences Layer 1's cue lexicon
had already flagged:

```
const actionable = candidates.filter(c => categoryOf(c.kind) === "actionable");
const clusters = clusterByTime(actionable);   // Layer 2 only looked HERE
```

That made a roughly 1,000-line Hinglish word list the **hard recall ceiling** on assignments. A
lecturer phrasing an obligation in words the list did not contain produced no window, so the model
was never pointed at that part of the lecture — and the assignment was invisible, **with no error,
no warning and no empty state for anyone to notice**.

The commit points at the project's own history as the evidence that this had already happened
twice: `rules.ts` records that the "research paper / case study / literature survey" terms and the
entire imperative lexicon were both added *after* a real lecture came back empty. Both times the
symptom was a lecture with no assignment, and both times that looked like a lecture with no
assignment.

### The fix

Both passes now sweep the whole lecture. Cue hits are passed into each window as **evidence about
that window** rather than as **permission to look at it** — which is what the lexicon is genuinely
good at: it is a cheap, precise, offline prior, and a prior belongs in the prompt, not in the
control flow. Where no cue fired, the prompt says so and raises the bar for that window rather
than skipping it. The teaching pass already worked this way and needed no change.

**Actionable windows overlap by 60 s** (180 s window, 120 s stride). An obligation is assembled
from statements up to a minute apart — four sentences over 45 s in the reference lecture — so a
boundary falling between the setup and the pronoun referring back to it would destroy the exact
case this layer exists for. Verified: guaranteed co-read distance is 61 s.

Overlap means one assignment can be reconstructed twice, so items are merged on **where their
evidence sits** rather than on what they are called. The model words a title differently per
window but cites the same sentences, and those are already verified character positions. Checked
against six cases including short-span-inside-long and zero-width spans.

Version bumped to **1.1.0** so runs before and after remain comparable, under the same contract
`extraction_method` carries.

### The cost, measured

The sweep doubles the call count and lowers the maximum lecture length the pipeline can handle on
the request path:

| Lecture length | Calls | Time | Outcome |
|---|---|---|---|
| 23 min | 20 | ~200 s | fits |
| 36 min | 30 | ~300 s | at the `maxDuration` limit |
| 50 min | 42 | ~440 s | **times out** |
| 90 min | 75 | ~760 s | **times out** |

The ceiling drops from roughly 90 minutes to roughly 36. **That is the price of assignment recall
and it is not fixable by tuning** — reconstruction has to move off the request path into a
background job. Concurrency was deliberately left at 4: the right value depends on the provider
rate limit, which has not been measured, and guessing it trades a known ceiling for silent 429
losses.

Verified: `tsc` clean, `next build` clean, `eslint` clean, overlap and dedupe checked numerically.

## Decisions made

**No entries were added to [`../decisions.md`](../decisions.md).** Two choices in this session are
real decisions with named costs and belong there; they are recorded here as **inferred from the
commit**:

1. **Trade the maximum processable lecture length for assignment recall**, taking the ceiling from
   ~90 minutes to ~36. The cost is stated numerically in the commit and is now an open blocker: a
   50-minute lecture cannot be processed at all.
2. **Leave concurrency at 4 rather than guess a higher value**, on the reasoning that an unmeasured
   rate limit turns a visible ceiling into silent losses. This is the same shape of judgement as
   the rest of the file and is the reason the ceiling is a documented number instead of an
   intermittent failure.

Both are the kind of trade-off `TEAM.md` §3 says gets a `decisions.md` entry with the reasoning.
Neither got one.

## Learnings captured

**None.** No `AI-Memory/Inbox/` entry was written. Captured belatedly on 2026-08-30 in
`AI-Memory/Inbox/classmind/2026-08-30T1108Z-transcript-guard-and-mvp-sprint/`.

## Mistakes hit

- **The change was first committed as `a5b5c71` "Auto-save: reconstruct.ts"**, carrying 180 lines
  of substantive design with no explanation. `f81956f` was written an hour later specifically to
  supersede it. That is the right correction, and it is also the second time in this project's
  history that a real change reached `origin/master` under an `Auto-save:` message before anyone
  explained it — the 2026-08-22 identity fix landed under `729b180` the same way. The autosave hook
  is a safety net that keeps committing over the historian.
- **No session log and no `progress.md` entry**, for the fourth consecutive session. By this point
  the last entry in `progress.md` was four days old and described a product two significant
  versions behind what was deployed.
- **The end-to-end suite was not run.** It had been aborting since 2026-08-24. Running it here
  would have surfaced the breakage two days earlier and four days before it was actually found.

## Ending state

Reconstruction v1.1.0 is on `master` and pushed. Assignment recall no longer depends on the cue
lexicon's coverage. The pipeline's practical ceiling is roughly a 36-minute lecture, on the request
path, and that is now the binding constraint on real classroom use — most lectures are longer.

Unchanged and still open: the wrong-language transcript defect, lecture `5ced44b6`'s foreign
transcript, no consent mechanism, and — unknown at the time — a broken end-to-end suite.

## Next session should start with

Moving reconstruction off the request path, or accepting the 36-minute ceiling in writing. And the
four missing session logs.

*(On 2026-08-30 neither was done. The session that followed rebuilt the transcript guard instead —
a higher-priority correctness problem — and closed the documentation gap. The 36-minute ceiling is
still the binding constraint.)*
