# 2026-08-31 (daytime) — The extract client stops timing out, Groq schema failures get one retry, and the OAuth allow-list learns about v3

> **Reconstructed retroactively on 2026-09-01** from the git record (Auto-save commits
> `765f953..5695d42`, 09:15–13:30 IST) and the code's own comments. No conversation
> transcript or session capture existed for this work. Everything stated as fact below is
> verifiable in a diff; everything inferred is marked as an inference.

**Inbox entry:** [`AI-Memory/Inbox/classmind/2026-08-31T0800Z-groq-schema-carveout-and-oauth-allowlist/`](../../../AI-Memory/Inbox/classmind/2026-08-31T0800Z-groq-schema-carveout-and-oauth-allowlist/)
**All work in `product/classmind-v3/`.** Five files changed; one throwaway probe created and deleted.

## Starting state

The 2026-08-30 (night) session had ended with three named next steps: fix the client
timeout in `scripts/verify-processing-run.mts`, take the clean Groq baseline (budget ~109K
of 200K daily tokens, roughly one attempt per day), then build Option D. No clean baseline
existed — three attempts, three different failures, the third killed at exactly 300 s by
undici's non-configurable headers timeout. Separately, v3 had just moved to port 3400, and
its local Google sign-in had never been exercised.

## What was done

**1. `verify-processing-run.mts` no longer times out, and no longer points at the wrong
app.** The `/extract` request is now sent with plain `node:http`/`node:https` instead of
`fetch` — Node's fetch is undici with a 300 s headers timeout that cannot be configured
without installing undici as a dependency, and `/extract` sends no bytes until the whole
reconstruction is done. Worse than the client dying: the client abort took the server run
with it — Next cancelled the route handler mid-run and no ledger row was written, which is
what actually destroyed the 2026-08-30 attempt. The run is now allowed to take as long as
it takes, with a heartbeat line every two minutes so silence is visibly progress. The
script's default base URL was also corrected from `http://localhost:3300` — **classmind-v2's
port** — to v3's own 3400; the old default would have driven a paid extraction through the
wrong codebase had a v2 server been listening.

**2. A Groq baseline run was executed.** This is evidenced, not remembered: the comment
written into `openai-compatible.ts` that day cites "the 2026-08-31 baseline run" and its
result — **1 window of 20 came back as a 400 `json_validate_failed`** (a top-level array
where the schema's root is an object) while its 19 neighbours validated. What the repo does
**not** record: whether the run completed, whether a `processing_runs` ledger row was
written, and what it cost. Recording the cost of a paid run is a charter rule and it was
not followed here, because the session left no record at all. The open question is captured
as a candidate and must be answered from `processing_runs` before the next paid run.

**3. The `schema_validation` carve-out.** Groq's strict `json_schema` mode turns out to
validate the completion *after* generating it rather than fully constraining decoding — so
a 400 with code `json_validate_failed` is a verdict on one sampled generation, not on the
request. Blanket "4xx is fatal" would burn the window; blanket retry would pay to reproduce
failures. The carve-out is deliberately narrow: status 400 + that exact code + **exactly one
retry**, tracked per failure class so a transient failure elsewhere in the window cannot
grant a second one. Classification now reads the **full** response body — the code was
previously slicing the detail to 300 characters, and `json_validate_failed` sits past the
provider's error prose. `test-provider-registry.mts` gained both classification checks
(400-only, code-required; the same body on a 422 stays fatal) and behavioural ones (schema
failure then success = exactly two requests; a second schema failure stops the window at two
requests and counts as fatal).

**4. The OAuth allow-list, and why local v3 sign-in landed on v1.** Signing into local v3
via Google landed the browser on the **old v1 production deployment** after consent
(inference from the probe + the fix; the mechanism is verified). A one-off Playwright probe
(`tmp-oauth-probe.mjs`, created 09:15, deleted 09:16, never reaching Google — it captured
and aborted the `/auth/v1/authorize` request) showed the `redirect_to` v3 asks for. Root
cause: `http://localhost:3400/**` was not in the shared Supabase project's redirect
allow-list, and Supabase **silently falls back to the Site URL** — currently v1's domain —
whenever `redirectTo` is not allow-listed. No error anywhere. `DEPLOY.md` now records the
whole shape: the Supabase project is shared across v1/v2/v3 so the allow-list is
**additive** (never remove v1's entries, never change the Site URL while v1 is live), the
glob matches the *entire* URL including query string, and `localhost` does not match
`127.0.0.1`.

## Decisions made (captured as candidates, not written into decisions.md)

- `json_validate_failed` gets exactly one retry, and the bound lives in `complete()`, not
  in the classifier. Anything past one is paying to reproduce a failure.

## Problems hit

All four numbered items above *are* the problems; nothing else surfaced in the record.

## Unresolved questions

- **Did the 2026-08-31 Groq baseline complete, and what did it cost?** Not answerable from
  the repository. Check `processing_runs` for a row from that day before spending again.

## Ending state

All five file changes committed via Auto-saves (`765f953..5695d42`); no intentional commit,
no session log, no progress entry, no Inbox capture were made on the day. This log and its
capture were written 2026-09-01 as part of closing that record gap.

## Next session should start with

Confirming the baseline's fate in `processing_runs`, then the remaining 2026-08-30 queue:
clean baseline (if still missing) and Option D.
