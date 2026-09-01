---
project: classmind
session_id: 2026-08-31T0800Z-groq-schema-carveout-and-oauth-allowlist
schema_version: 1
generated_by: End-Session/1.0.0 (hand-authored retroactively, 2026-09-01)
generated_at: 2026-09-01T13:30:00Z
---

# 2026-08-31 (daytime) — Groq schema carve-out and the OAuth allow-list

> **Retroactive capture.** This work (Auto-saves `765f953..5695d42`, 09:15–13:30 IST)
> ended with no session record. Reconstructed on 2026-09-01 from git and the code's own
> comments; no conversation transcript existed. Facts are diff-verifiable; inferences are
> marked. The fuller narrative is the project session log
> `Projects/classmind/.knowledge/sessions/2026-08-31-groq-schema-carveout-and-oauth-allowlist.md`.

## Starting state

The 2026-08-30 night session's queue: fix the client timeout in
`verify-processing-run.mts`, take the clean Groq baseline, build Option D. No clean
baseline existed; the previous attempt died at exactly 300 s (undici's headers timeout)
and the client abort cancelled the server-side run — no ledger row.

## What was done

1. `verify-processing-run.mts` drives `/extract` through plain `node:http` (no client
   timeout unless asked), with a 2-minute heartbeat; its default base URL corrected from
   3300 (**v2's port** — a paid run through the wrong codebase waiting to happen) to 3400.
2. A Groq baseline run was executed (evidenced by the comment in
   `openai-compatible.ts` citing "the 2026-08-31 baseline run"): 1 of 20 windows returned
   400 `json_validate_failed` (top-level array where the schema root is an object); the 19
   neighbours validated. Completion, ledger row, and cost are **not recorded anywhere** —
   the charter's record-the-cost rule went unmet because the session left no record at all.
3. A new `schema_validation` failure class: Groq's strict `json_schema` mode validates the
   completion *after* generation, so that 400 is a verdict on one sampled generation, not
   on the request. Carve-out is status 400 + that exact code + exactly one retry, tracked
   per class; classification reads the full body (the code had been slicing detail to 300
   chars, which can cut the code off). Tests added for both classification and the
   one-retry bound.
4. Local v3 Google sign-in was landing on the **v1 production deployment** after consent.
   A one-off Playwright probe (created and deleted the same minute) captured the
   `/auth/v1/authorize` URL and aborted it before Google. Cause: `localhost:3400` absent
   from the shared Supabase project's redirect allow-list, and Supabase silently falls
   back to the Site URL (v1's domain). `DEPLOY.md` now records: allow-list is additive
   across v1/v2/v3; the glob matches the entire URL including query; `localhost` does not
   match `127.0.0.1`.

## Decisions made

- `json_validate_failed` gets exactly one retry; the bound lives in `complete()`.

## Problems hit

The four items above are the problems.

## Unresolved questions

- Did the 2026-08-31 Groq baseline complete and write a `processing_runs` row, and what
  did it cost? Must be answered from the database before the next paid run.

## Ending state

Five files changed, committed only as Auto-saves; no capture until 2026-09-01. No Sarvam
call of any kind; one paid Groq reasoning run as described.

## Next session should start with

Confirming the baseline's fate in `processing_runs`; then clean baseline (if missing) and
Option D.
