---
session_id: 2026-08-22T0930Z-classmind-v1-build-and-verification
schema_version: 1
generated_by: hand-authored, following End-Session/1.0.0 § 7
generated_at: 2026-08-22T00:00:00Z
---

# 2026-08-22 — ClassMind V1 build and verification

> Context is **partial**. This session continues one earlier the same day that hit its usage
> limit mid-build; that half's conversation is not available here and its work was reconstructed
> from the repository. The session boundary (`84c68de`) is where the continuation began, so the
> first half's commits are outside it.

## Starting state

The ClassMind V1 product platform existed as code and had never been executed. Schema applied,
storage bucket live, 19 routes, the whole UI, and `lint` / `tsc` / `build` all passing. No course
had ever been created, no lecture uploaded, no candidate reviewed. The extraction self-test had
never been run. `package.json` referenced a `scripts/setup-storage.mts` that did not exist. The
decision to build the product at all — which crosses a frozen protocol — had been stated in
conversation and never written down.

## What was done

Built a fixture `TranscriptionProvider` that replays three verbatim Sarvam responses captured
during Lab v0 RUN 1, so the workflow could be driven without paid API calls. Wrote an end-to-end
driver that exercises the product over HTTP as a browser does. Ran it.

Running it found two defects, neither visible from code that compiled:

1. The extraction engine returned 2 candidates from an 18-minute university course-outline
   lecture, missing the whole syllabus and the prescribed textbook. Its lexicon had been built
   from a Class-12 coaching lecture. Two new rules; 21 candidates; version 1.0.0 → 1.1.0.
2. The provenance guard written for the Arabic wrong-language failure could not see that
   failure — the engine had reported the *correct* language code and only the transcript text
   was wrong. Replaced with a check that reads the text.

Also: recorded the superseding decision, wrote the missing storage setup script, handled the
duplicate-review-queue consequence of the version bump, and rewrote the root `HANDOFF.md`, whose
§ 0 still claimed nothing was committed.

Two subagents ran in parallel — one auditing and fixing the UI layer, one verifying the Hindi and
wrong-language paths. The second found defect 2.

## Decisions made

`Projects/classmind/.knowledge/decisions.md` — **2026-08-22, build the Product Platform V1 before
the walkthrough runs, and encode the domain model in it.** Crosses `walkthrough-protocol.md`
§ Stopping rule completely rather than on a technicality, with the cost stated: if the
walkthrough later shows the categories wrong, that is a migration and a re-extraction.

## Problems hit

- **Both defects were of the same kind:** code written against a *description* of a requirement
  rather than against the input. Neither was reachable by reading, typechecking or building.
  → `cand-001`, `cand-002`.
- **Long heredocs through the shell truncated silently**, twice, and had to be routed through
  script files instead. Tooling friction, not a finding.
- **The evidence generator initially reported 2 commits for a boundary containing 34**, because
  it skipped records where `%b` was empty. Caught by disbelieving the number. Worth noting only
  because an evidence file is supposed to be the trustworthy half of an entry, and a silently
  wrong one is worse than an absent one.

## Unresolved questions

- **The autosave hook commits other agents' in-progress work when subagents run in parallel.**
  32 of this session's 34 commits are `Auto-save:` messages naming one file while containing
  others. → `cand-004`.
- **No live Sarvam call has ever been made from the product.** Everything verified today ran
  through replay. Until one real call is made, the integration boundary is verified and the
  integration is not.
- **No romanized-Hinglish ASR fixture exists** — the case the extraction lexicon covers most
  heavily, and the one with the least real evidence behind it.
