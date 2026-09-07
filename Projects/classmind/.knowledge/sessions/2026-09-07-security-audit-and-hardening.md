# 2026-09-07 — Security audit, red team and hardening (v4 audit copy)

Autonomous overnight run per the operator's written brief, confined to the
disposable copy `product/classmind-v4 - sECURE aUDIT`. The original
`classmind-v4` tree was neither read nor written.

**Spend: zero.** No suite on CLAUDE.md's paid list was run. Every live check was
read-only (Supabase bucket metadata, table existence) or unauthenticated (HTTP
probes against a local production build on port 3599). The operator's dev server
on 3500 was left running and untouched.

The full security model, the accepted trades and the remaining risks are in
`product/classmind-v4 - sECURE aUDIT/SECURITY.md`. The finding-by-finding
narrative is in three commit messages (`268a6c7`, `85ee559`, `b11d749`). The
executable record is `scripts/test-security-regression.mts` — 193 assertions,
each named after the vulnerability it pins closed.

## Method

Two adversarial multi-agent runs, with my own verification between them:

- **14-campaign attack sweep** — 173 agents across role escalation, IDOR, scope
  isolation, RLS/service-role, API authorization, auth/session/OAuth, storage,
  AI retrieval, prompt injection, cost abuse, races, injection, frontend trust,
  secrets/headers/deps. 79 raw findings, deduped, then verified by two lenses per
  finding (one instructed to refute, one to build the exploit). **84 verdicts
  refuted.**
- **Independent re-audit + student-account red team** after remediation — 101
  agents, written specifically to attack the first pass's own work. It found
  **8 real defects in my fixes**, including one that would have silently defeated
  the whole schema half.

Findings were checked against the code before being acted on; several agent
findings were refuted by my own reading. Two were reproduced with a runnable
script before and after the fix.

## The two that mattered

**The faculty gate protected a label, not a capability.** `POST /api/courses`
called only `requireUser()`. Any free Google sign-up could create a course,
become its owner, and from that moment satisfy `requireCourseOwner` on every
teaching and paid route behind it — signed upload URL, billable Sarvam ASR,
billable reasoning extraction, and the candidate and knowledge review queues that
"no unverified information reaches students" depends on. `FACULTY_ACCESS_CODE`
gated who may hold the label; nothing gated what the label was protecting.
`CoursesClient` renders "New class" behind `role === "faculty"` — a hidden button
was the only thing in the way.

Fixed structurally: `requireFaculty` as a named boundary; `requireCourseOwner`
and `requireCourseAccess` now take the `SessionUser` and assert the role (an id
cannot carry a role, and a helper told separately is one a caller can forget to
tell); the invariant "isOwner implies faculty" now holds on every read path
including the global Ask corpus, `/api/me/overview` and `GET /api/courses`.
Checking the role at USE time also closes any course already owned by a
student-role account.

**Nothing bounded spend.** No rate limit existed anywhere except the five-strike
faculty-code counter, so one account could loop `/extract?force=1` without limit.
Four layers now: an in-process burst and hourly window; a durable per-user quota
read back from `ask_runs`/`processing_runs` (counting `degraded` as well as
`model` — an attempt is a cost until proven otherwise); a deployment-wide ceiling
that creating more accounts cannot reset; and a single-flight claim closing the
read-then-write race in the reuse ledger, which made two concurrent extracts of
one lecture both pay in full.

The window ceiling is derived from `maxDuration = 300` and the ~40s-per-call
measurement already in `reconstruct.ts`, not from a round number — my own first
draft used 120 per pass, roughly seven times what the request budget can finish,
which pays for every window and then dies *before* `recordRun` writes the ledger,
so the next attempt pays again from zero.

## Also fixed

Open redirect (`safeNext("/<TAB>/evil.com")` resolved to `https://evil.com` — the
URL parser deletes tab/LF/CR after the prefix check passes; reproduced).
Prototype keys passing as audio extensions, putting the `Object` constructor into
a stored content type and an outbound header. A storage object key built from the
uploader's filename. Unbounded knowledge text flowing into a billed prompt, at
both the write path and the renderer. Stored conversations replaying knowledge a
lecturer had since rejected. `profiles.role` still defaulting to `'faculty'`. A
review gate that failed open on any kind the model invented, and that gated
`exam_instruction` — not a kind this codebase emits — while `exam_scope` published
freely. The raw provider response reaching students whenever normalization failed.
Ten routes leaking PostgREST driver text. A perimeter with no security headers
and no cross-site gate.

## The comment-drift class — and a corroboration

Three comments asserted guarantees the code did not have, each true when written:
`profile-role.ts` naming "the schema default" among five removed faculty
fallbacks that the migration still declared; `transcribe/route.ts` asserting the
file extension "comes from the storage path this server generated, never from the
name the uploader typed" while `lectureObjectPath` copied the uploader's verbatim;
and three migrations headed "NOT APPLIED" whose tables the live database has.

That last one is **the same drift the 2026-09-06 (VI) pass found and corrected in
`classmind-v4`** — it survives in the audit copy. It is not cosmetic: a migration
written from those headers issues a `REVOKE` against a function it assumes
absent, and because a migration is one transaction it takes every unrelated
statement down with it. The hardening migration is conditional for exactly this
reason.

## Verification

748 assertions across all 12 free suites, 0 failures. `tsc` and `eslint` clean.
`verify:storage` (live, read-only, free) confirms the lecture bucket is private,
audio-only, 50 MB capped. Unauthenticated live probes: every API route refuses;
cross-site, same-site, navigate, forged Origin and `Accept: text/html` all 403;
six security headers on pages, 401s and 403s; CSP nonce unique per response and
present on all 12 emitted scripts; no server secret in the client bundle.

## UNVERIFIED

**Every authenticated boundary.** Cross-user isolation, role escalation and cost
limits were established by reading code, by offline tests and by unauthenticated
probes. Confirming them end to end needs a Google OAuth sign-in, which needs a
human. Those areas are marked UNVERIFIED in `SECURITY.md` rather than claimed.

## HUMAN ACTION REQUIRED

1. **Delete `faculty.test@classmind.local` and `student.test@classmind.local`.**
   Their shared password is hardcoded in 50 files tracked at HEAD in a public
   repository. One is a faculty account, and faculty now gates every teaching and
   paid route — so the boundary this whole audit strengthened is bypassable by
   anyone who reads the repo. Rotating is not sufficient: delete the accounts,
   and never reuse the credential. The verify scripts should read it from
   `.env.local`. (`DEPLOY.md` §6 already lists this; the box is unticked.)
   Whether those accounts still accept that password is **UNVERIFIED** — checking
   would mean authenticating to a live system with real credentials.
2. **Apply `supabase/migrations/20260907120000_security_hardening.sql`.** No
   documented deploy step applies migrations at all, which is its own finding.
3. **Decide on pushing.** Three commits exist locally; nothing was pushed. Only
   the changed security files were committed — `.eval/` and `design-loop/runs/`
   are lecture-derived and the repository is public, so publishing them is an
   operator decision, not mine.

## Note for whoever runs End-Session next

Turbopack writes the live Sarvam and Gemini keys into `.next/cache` in cleartext
on every build, and reproduces them after a wipe. `.next` is git-ignored so this
is not published and the client bundle is clean — but zipping the project, an
artifact upload or a shared build cache carries them even though `.env.local` was
excluded. There is no code fix; `npm run verify:build-secrets` makes it visible.
