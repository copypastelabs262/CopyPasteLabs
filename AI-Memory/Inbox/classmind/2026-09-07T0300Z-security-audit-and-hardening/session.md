---
project: classmind
session_id: 2026-09-07T0300Z-security-audit-and-hardening
schema_version: 1
generated_by: End-Session/1.0.1 (hand-authored)
generated_at: 2026-09-07T03:00:00Z
---

# 2026-09-07 (overnight) — security audit and hardening of the v4 audit copy

> Chapter capture. The security model, accepted trades and remaining risks live in
> `product/classmind-v4 - sECURE aUDIT/SECURITY.md`. The three commit messages
> (`268a6c7`, `85ee559`, `b11d749`) carry the finding-by-finding narrative. The
> executable record of what was fixed is
> `scripts/test-security-regression.mts` — 193 assertions, each named after the
> vulnerability it pins closed.

## Starting state

Operator commissioned an autonomous overnight security audit, red team and
hardening pass over a disposable copy of v4 (`classmind-v4 - sECURE aUDIT`), with
standing authority to implement fixes without asking. Constraints: no paid
provider calls, no touching the original v4 tree, no rotating or revoking real
credentials.

## What was done

Two adversarial multi-agent runs — a 14-campaign attack sweep (173 agents, 79
findings, 2-lens verification, 84 verdicts refuted) and, after remediation, an
independent re-audit plus student-account red team (101 agents) written
specifically to attack the first pass's own work. Findings were verified against
the code before acting on any of them; two were reproduced with a runnable
script before and after the fix.

Six rounds of remediation across three commits. The two that mattered most:

**The faculty gate protected a label, not a capability.** `POST /api/courses`
called only `requireUser()`, so any free Google sign-up could create a course,
become its owner, and thereby satisfy `requireCourseOwner` on every teaching and
paid route behind it — upload, transcribe, extract, review, delete. The UI hides
"New class" behind `role === "faculty"`; that was the only thing in the way.
`requireFaculty` now exists as a named boundary, `requireCourseOwner` and
`requireCourseAccess` take the `SessionUser` and assert the role, and the
invariant "isOwner implies faculty" holds on every read path.

**Nothing bounded spend.** No rate limit existed anywhere except the five-strike
faculty-code counter, so one account could loop `/extract?force=1` without limit.
Four layers now: in-process burst and hourly windows, a durable per-user quota
read back from `ask_runs`/`processing_runs`, a deployment-wide ceiling a new
account cannot reset, and a single-flight claim closing the reuse-ledger race.
The window ceiling is derived from `maxDuration = 300` and the measured 40s per
call — an earlier draft of my own used a round number and admitted runs the
request budget cannot finish, which pay and then die before the ledger records
them.

Also fixed, each verified: an open redirect (`safeNext("/<TAB>/evil.com")`
resolved to `https://evil.com`, reproduced); prototype keys passing as audio
extensions and putting the `Object` constructor into a content-type header; a
storage key built from the uploader's filename; unbounded knowledge text flowing
into a billed prompt; stored conversations replaying rejected knowledge; the
`profiles.role` default of `'faculty'`; a review gate that failed open on any
model-invented kind; the raw provider response reaching students whenever
normalization failed; ten routes leaking PostgREST driver text; and a perimeter
with no security headers and no cross-site gate.

## What was found and NOT fixed

The highest-risk finding cannot be fixed from inside the codebase: `DEPLOY.md`
records live faculty and student accounts in the Supabase project whose shared
password is hardcoded in 50 files tracked at HEAD in a public repository. Deleting
those accounts is the single highest-value action available and it is an operator
action.

Turbopack's persistent cache writes live Sarvam and Gemini keys into
`.next/cache` in cleartext on every build. `.next` is git-ignored so it is not
published, and the client bundle is clean — but zipping the project or sharing a
build cache carries the keys even though `.env.local` was excluded.
`verify:build-secrets` makes it visible; there is no code fix.

## Verification

748 assertions across all 12 free suites, 0 failures. `tsc` and `eslint` clean.
Live, read-only, free: storage bucket confirmed private with an audio-only MIME
list and a 50 MB cap. Unauthenticated live probes against a local production
build: every API route refuses, every cross-site shape returns 403, security
headers present on pages and on refusals, CSP nonce unique per response and
matching every emitted script.

**Zero paid provider calls were made.** No suite on the paid list was run.

## Honest limits

No authenticated boundary was tested against a live session — that needs Google
OAuth, which needs a human. Cross-user isolation, role escalation and cost limits
were established by reading code, by offline tests, and by unauthenticated
requests. Those areas are marked UNVERIFIED in `SECURITY.md`, not claimed.

## Next

1. Delete the two exposed Supabase accounts (operator).
2. Apply `supabase/migrations/20260907120000_security_hardening.sql` — no
   documented deploy step applies migrations at all, which is its own finding.
3. Review the three commits and decide on pushing; nothing was pushed.
