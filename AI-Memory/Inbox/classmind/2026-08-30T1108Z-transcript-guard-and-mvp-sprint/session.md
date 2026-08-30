---
project: classmind
session_id: 2026-08-30T1108Z-transcript-guard-and-mvp-sprint
schema_version: 1
generated_by: End-Session/1.0.0 (hand-authored)
generated_at: 2026-08-30T11:08:26Z
---

# 2026-08-30 — A transcript guard that can see the failure it was written for, and eight days of missing record

## Starting state

`Projects/classmind/.knowledge/progress.md` had no entry after 2026-08-22 14:56 and
`sessions/` had no log after `2026-08-22-classmind-v1-build-and-verification.md`. Six substantive
commits had landed in between — a Vercel deployment, a Privacy Policy and Terms, a verified
lecture-identity fix that also made the first live Sarvam calls, teaching extraction, the knowledge
layer, and reconstruction v1.1.0 — and none of them appeared in any document. Under `TEAM.md` §0
that means two of the three founders had eight days of work they could not see except by reading
commits.

The known open defect was the wrong-language transcript. On 2026-08-22, on a live production call,
Sarvam returned fluent romanized Arabic for an English DSP lecture while reporting the language as
`en-IN` — the code it had been sent. All three existing guards stayed silent. It was reported at
the time and deliberately not fixed, on instruction.

Also true at the start, and unknown: `scripts/e2e.mts` had been aborting since 2026-08-24.

## What was done

**Priority 1 — the transcript guard — shipped in v1 and verified.**
`src/lib/provenance/transcript-validation.ts` replaces `language-check.ts` and asks a different
question. Not *"does this transcript match the language the run was configured for?"* — that
question makes the guard depend on the setting that was already wrong, and it produces false
positives on genuine recordings (a Devanagari Hindi class in a course configured `en-IN`, and a
short romanized-Hinglish clip in a course configured `hi-IN`, are both flagged by a
configured-language check, and both transcripts are good). Instead: *"is this plausibly any
language this product serves?"* A wrong-language transcript fails that without anyone needing to
know what the right language was.

Three properties, each answering one of the ways the old guard failed:

- **Configuration-independent.** It reads the transcript text and no provider metadata at all.
- **Judged at any length.** The rate is scored with a Wilson interval and rejected only when the
  optimistic end of the interval is still below threshold. Sample size changes how much evidence is
  demanded, never whether the question is asked.
- **Consumed.** Migration `20260830100000_transcript_quarantine.sql` adds a `quarantined` status
  and a stored `transcript_validation` verdict column. The poll route writes the state in the same
  `UPDATE` as the transcript; the extract route refuses to run on it and validates on the spot any
  row transcribed before the guard existed. A quarantined lecture keeps its raw response — the
  artefact everything is re-derivable from and the only proof of what the engine did.

Verified: transcript guard **33/33**, extraction **76/76**, quarantine end-to-end **29/29** against
a running server with real auth and the live database. The migration was **applied to the live
Supabase project by the operator**. The two suites are deliberately separate because they make
different claims: one proves the judgement is right, the other proves the pipeline acts on it.

**Found while reconstructing the record: `scripts/e2e.mts` has been silently aborting since
2026-08-24.** It reads `ask.json.items`; commit `f0fc84e` rewrote that route to return `sources`.
`ask.json.items.length` throws a `TypeError`, the top-level catch turns it into one failure line,
and 17 of the suite's 64 checks never execute — including the section asserting that no unverified
information reaches students. It throws only when the ask *succeeds*, so the suite breaks precisely
when the product works. The same commit removed `skipped` from the extract route's response, which
leaves the duplicate-processing check asserting a key that no longer exists.

**Documentation restored.** Three reconstructed session logs (2026-08-22 evening, 2026-08-24,
2026-08-26), each carrying a banner saying it was written retroactively and flagging inferences as
inferences; four `progress.md` entries; dated forward markers on the 2026-08-22 entry where later
work cleared what it recorded as blocked. Nothing was written to permanent `AI-Memory/`.

**A ClassMind v2 app was forked** to `Projects/classmind/product/classmind-v2/` for a UI/MVP
sprint. v1 is unchanged apart from the Priority 1 work.

## Decisions made

None were written to `Projects/classmind/.knowledge/decisions.md`, and that is worth flagging
rather than passing over: three decisions with real trade-offs are now visible only in code and
commit messages. The 2026-08-24 choice to publish teaching knowledge automatically while gating
actionable items behind a human is a policy about who is accountable for what a student reads. The
2026-08-26 choice to trade the maximum processable lecture length (~90 min → ~36 min) for
assignment recall is a measured cost with no written owner. And the 2026-08-22 choice to leave a
lecture carrying a foreign transcript rather than re-transcribe it is still in force.

Writing them up is a deliberate act, not a side effect of closing a session, so they are reported
here and not filed.

## Problems hit

- The old guard failed in four distinct ways, and only one of them was already captured. The other
  three are `cand-001`, `cand-002` and `cand-003` in this entry.
- Two test assertions broke on 2026-08-24 and neither was noticed for six days. The proximate cause
  is a rename; the reason it survived is that no session record existed to say which suites had not
  been re-run. That is `cand-005`, and it is the finding this session most wants a future reader to
  have.

## Unresolved questions

- **Transcript/audio identity is unsolved.** The guard now catches a transcript in the wrong
  language; nothing proves a transcript belongs to the audio it is stored against. Lecture
  `5ced44b6-e156-4ddb-9146-14035d366620` still carries a foreign transcript, left alone
  deliberately.
- **Duplicate-processing has never been verified.** Its only test asserts a key the route does not
  return, so the claim "re-running the same method does not duplicate" is untested rather than
  false.
- **Reconstruction caps at roughly 36 minutes on the request path**, so a 50-minute lecture cannot
  be processed. Moving it to a background job versus accepting the ceiling is an open decision.
- **Does the v1/v2 split pay for itself?** No evidence yet either way; it is one day old.

## Ending state

v1 quarantines wrong-language transcripts before extraction can read them, verified against the
live database with the migration applied. The written record is current through today. The
end-to-end suite is known-broken and not yet fixed. The Priority 1 work was in the working tree and
uncommitted when this entry was written.

## Next session should start with

Fixing the two assertions in `scripts/e2e.mts` and running the suite to completion. Until it
completes, the student-safety checks are claims, not results.
