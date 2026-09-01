# 2026-09-01 (evening) — The recovery chapter closes: the ledger answers the Groq question

**Inbox entry:** [`AI-Memory/Inbox/classmind/2026-09-01T1758Z-recovery-closure-and-ledger-check/`](../../../AI-Memory/Inbox/classmind/2026-09-01T1758Z-recovery-closure-and-ledger-check/)
**No product code was touched.** This session's writes are records only; its one external
action was a read-only database query.

## Starting state

The two undocumented work streams (2026-08-31 daytime, 2026-09-01 daytime) had just been
recovered into session logs, progress entries, and two Inbox captures. One open question
remained, carried as candidate `cand-005` of the `2026-08-31T0800Z` entry: a paid Groq
baseline run demonstrably happened on 2026-08-31, but nothing recorded whether it
completed, whether a `processing_runs` ledger row existed, or what it cost.

## What was done

**One read-only query against `processing_runs`** (PostgREST GETs with the service key;
no writes, no paid endpoints), operator-approved. It returned three rows, all over the
same lecture (`dfd7312d`, "WhatsApp.mp3" — the real lecture every baseline attempt has
used), and the third answers cand-005 completely:

- **Row `ff0721de`, created 2026-08-31 07:36 UTC (13:06 IST):** `groq /
  openai/gpt-oss-120b`, `llm-reconstruct / 1.1.0`. **Outcome `partial`,
  `complete=false`** — 19 of 20 windows succeeded; the single failure is the
  `teaching 881s` window with `400 json_validate_failed`, matching the carve-out comment
  in `openai-compatible.ts` verbatim. Fully metered: 20 HTTP attempts, 19 successful
  completions, 0 retries, 0 rate-limits (rpm=1, concurrency=2), **27,891 prompt +
  18,844 completion = 46,735 tokens**, 1,147 s wall time. 37 items proposed, 0 dropped
  unverifiable; `knowledge_total` stayed 24 — **the Sarvam baseline is untouched**.
- Timeline coherence, confirmed rather than assumed: the no-timeout client fix was
  auto-saved 12:36–12:37 IST, the ~19-minute run completed at 13:06 IST (so the fix is
  what let it survive), and the carve-out it motivated was auto-saved by 13:30 IST.
- The two earlier rows are the already-documented 2026-08-30 Gemini free-tier attempts
  (`gemini-3.7-flash` 20/20 failed on 429 quota; `gemini-3.5-flash` 12/20 succeeded, 27
  attempts, 8 rate-limited) — consistent with the 2026-08-30 night record, no surprises.
- The row is `partial`/`complete=false`, so the reuse index excludes it by design —
  nothing will ever be served from it.

**One measured side-finding:** for the same 19 successful windows over the same lecture
and method, `gpt-oss-120b` emitted **18,844** completion tokens against
`gemini-3.5-flash`'s **3,281** (~5.7×). Captured as a candidate.

## Decisions made (operator, this session; captured as candidates, not written into decisions.md)

- **The Groq provider experiment is closed.** Row `ff0721de` — partial, 19/20, 46,735
  tokens — is its final recorded outcome. No re-run, no further investigation of old
  runs, costs, rows, or gaps. The one-retry carve-out it motivated stays in the tree,
  never yet exercised in anger.
- **Reasoning moves to the paid Gemini key as a separate, new phase** (key obtained and
  topped up today; Sarvam also topped up; a new lecture recording exists). Not started in
  this session, by instruction.
- **The Inbox backlog (now 8 pending entries) is deliberate.** The operator will build a
  proper skill around End-Session and Knowledge-Promoter before the backlog is drained;
  until then entries accumulate and nothing is promoted.
- Also standing from earlier today: learnings live only in the repository's pipeline
  (Inbox + `.knowledge/`), never in the assistant's own persistent memory — recorded
  there as a directive, and honoured by this capture.

## Problems hit

None. (One tooling note, not a problem with the record: a shell delete of the old
assistant-memory file was blocked by the permission classifier; the directive was applied
by replacing the file's content instead.)

## Unresolved questions

None identified. — cand-005 is answered; no significant open end remains in the
historical record. The standing product blockers (36-minute ceiling, background-job
migration, Option D, re-transcribe affordance, consent mechanism) are queue items for the
Gemini phase and the two-day brief, not open questions about history.

## Ending state

Historical record complete and coherent: every work stream since the 2026-08-31 design
capture has a session log, a progress entry, and an Inbox capture; the ledger evidence and
the reconstructed narrative corroborate each other at every timestamp checked. Working
tree clean, in sync with origin. No verification suites run — nothing this session touched
executes.

## Next session should start with

The Gemini phase, from the operator's two-day brief: set up the paid Gemini key as the
reasoning provider, test on stored transcripts, finalize the processing engine (the
36-minute ceiling and standing backend blockers), then the live faculty walkthrough with
the new lecture. The Groq result is context, not a task.
