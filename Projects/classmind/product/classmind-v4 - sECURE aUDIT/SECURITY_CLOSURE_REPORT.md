# ClassMind V4 — Security Closure Report

**Date:** 2026-09-07 · **Scope:** the disposable audit copy `classmind-v4 - sECURE aUDIT`
**Original V4 tree:** not read, not written. **Nothing pushed. Nothing deployed. Zero paid provider calls.**

Status vocabulary is used strictly: **VERIFIED** = directly tested and passed ·
**PARTIALLY VERIFIED** = meaningful evidence, material gap remains · **UNVERIFIED** = not tested ·
**HUMAN ACTION REQUIRED** = needs an external human-controlled action.

---

## 1. Executive summary

The previous audit left eight areas UNVERIFIED, all of them downstream of one assumption: that
signing in required Google OAuth and therefore a human. **That assumption was wrong.** The product
also accepts email/password through Supabase, and the service-role key can mint a throwaway
account — which is what every `scripts/verify-*.mts` in this repo already does. Building on that,
this pass closed six of the eight.

**Authenticated cross-user isolation, privilege boundaries, resource authorization, AI
authorization, spend enforcement and live database state are now VERIFIED** by
`npm run redteam:auth` — 145 assertions against four throwaway accounts created through the real
API and deleted afterwards, run against a production build with the provider keys blanked so no
request could spend.

Two remain open and both genuinely need a human: **the migration cannot be applied from here**
(no Docker, no psql, no local Postgres, project not linked), and **the published test credential
still exists in the original tree and in pushed git history**.

The pass found **16 defects**, of which **11 were in code or documents produced by the previous
audit pass** — including two that would have made the hardening migration a silent no-op, and one
that turned a cost guard into a permanent outage. All 16 are fixed. Two independent fresh red
teams and a Postgres specialist, none of whom wrote the fixes, produced the findings.

**911 assertions pass, 0 fail** (766 offline + 145 authenticated). TypeScript, ESLint and the
production build are clean.

---

## 2. Previous audit findings reviewed

Every claim from the prior pass was re-derived rather than trusted. Independently confirmed:

- `POST /api/courses` faculty gate — **VERIFIED live**: a real student account receives 403 and no
  course row is created.
- Role immutability — **VERIFIED live**: a student presenting the *correct* faculty code gets 409;
  the database role is unchanged.
- Open redirect, prototype keys, storage key shaping, header injection — **VERIFIED** by the
  offline suite, each reproduced before the fix.
- RLS-with-zero-policies — **VERIFIED live** (see §12), not merely read from the migrations.
- Client bundle free of server secrets — **VERIFIED** by two independent sweeps.

Corrected: `SECURITY.md` asserted `profiles.role` "has no database default as of 2026-09-07" while
the migration that drops it is **unapplied**. That is the same documentation-drift class the audit
itself had found three times. Now phrased as pending.

---

## 3. Findings independently reproduced

| # | Finding | Severity | How reproduced |
|---|---|---|---|
| 1 | Durable spend ledgers are erasable by deleting a lecture (`ON DELETE CASCADE`), resetting per-user quotas **and** both deployment-wide ceilings | HIGH | Migration FKs read directly; `DELETE /api/lectures/{id}` confirmed to have no limiter |
| 2 | `GLOBAL_LIMITS.transcriptionsPerHour` declared and never read — ASR, the most expensive path, had no aggregate bound | HIGH | grep: one occurrence, the declaration |
| 3 | Migration section 2 revoked `EXECUTE` from `PUBLIC` only; Supabase's default privileges give `anon`/`authenticated` their own direct ACL, so the statement was a no-op that reads as a fix | HIGH | Postgres ACL semantics; asymmetry with section 3 in the same file |
| 4 | Migration's default-privileges loop covered tables and sequences but **not functions** — the next `create function` re-opens what section 2 exists to close | HIGH | Read of the loop |
| 5 | Single-flight claim had no TTL; `maxDuration=300` is a *normal* outcome and a hard kill skips `finally`, so the lecture 409s forever | MEDIUM | `inFlight` was a `Set` with release only in `finally` |
| 6 | Free `degraded` asks consumed the deployment-wide ceiling — 13 free accounts could refuse every ask for everyone, at zero attacker cost | MEDIUM | `answer.ts` returns `degraded` when no provider is configured |
| 7 | Uncapped owned-course fan-out in both durable counters, which **fail open** on query error | MEDIUM | `.in(ids)` unbounded; `return null` treated as allow |
| 8 | "isOwner implies faculty" held as a *view-strength* downgrade, not an *accessibility* decision — the global ask corpus still read a student-role owner's course that every per-course route 403s | MEDIUM | Source read; **now reproduced as a seeded live test** |
| 9 | Leaf review routes authorized against the leaf's own `course_id` | INFO | Holds by construction today; **now a seeded live negative** |
| 10 | `HEAD` fell through to the `GET` handler on the paid course-ask route | INFO | `curl -I` → ran the handler |
| 11 | Two unguarded `REVOKE`s would abort the whole migration on a non-Supabase database | MEDIUM | Read |
| 12 | Migration could fail silently and entirely (NOTICE only, no post-condition) | MEDIUM | Read |
| 13 | `search_path` unpinned on three `public` functions | LOW | Read |
| 14 | Regression tests asserted *presence*, not *ordering* — `enforceMemoryLimit` could have moved after the provider and the test would still pass; one check named a property it did not check | MEDIUM | Read of my own tests |
| 15 | Six suites **re-create** the exposed accounts with the published password on sign-in failure | HIGH | `e2e.mts:105-107` |
| 16 | `.env.local` carries a BOM that breaks the Supabase CLI's env parser | INFO | CLI error |

---

## 4. Vulnerabilities fixed this pass

All 16 above. The substantive ones:

- **Ledger durability.** `DELETE /api/lectures/{id}` now rate-limited (10/hr, 3/min), and
  `20260907130000_ledger_durability.sql` moves the ledger FKs from `CASCADE` to `SET NULL`, adds
  `processing_runs.owner_id` with a backfill, and asserts its own post-condition.
  `billedRunsInWindow` prefers `owner_id` and degrades to the old fan-out while unapplied.
- **ASR aggregate ceiling** wired up; `enforceGlobalSpendCeiling("transcription")` now runs on
  `/transcribe`.
- **Migration corrected**: `from public, anon, authenticated` on all three functions; `on functions`
  added to the defaults loop; both bare `REVOKE`s guarded and split; `search_path` pinned; a
  post-condition that `raise exception`s if any `public` default ACL still grants to
  `anon`/`authenticated`.
- **Claim TTL** (360s > `maxDuration`), so a killed run frees the lecture on the next attempt.
- **Global ask ceiling counts `route='model'` only**; the per-user quota still counts `degraded`.
- **Fan-out capped** at 200 courses; `POST /api/courses` limited to 25/hr.
- **`listCourseMemberships` drops owned courses entirely when the owner is not faculty.**
- **Leaf review routes resolve the course through the lecture** and require the two to agree.
- **`HEAD` → 405** on the course-ask route.
- **Test credential removed from all 17 files** in this copy; `scripts/_test-credentials.mts` reads
  `CLASSMIND_TEST_PASSWORD` with **no default** and throws with the fix in the message.
- **Regression tests fixed** to assert ordering, and to compare the acquire against the
  *assignment* rather than the declaration.

---

## 5. Found but intentionally not fixed

| Finding | Why not |
|---|---|
| No duration ceiling on ASR — 50 MiB ≈ 3.6 h of billed audio, which extract then refuses | The only pre-transcription signal is byte size, and any cap penalises high-bitrate short lectures or admits low-bitrate long ones. Picking that trade is a product decision about recording quality, not an audit one. |
| Transcription quota counts `created_at`, so pre-staging lecture rows and submitting an hour later bypasses the durable half | Needs a `submitted_at` column — a migration that cannot be applied or verified here. |
| Cross-instance reuse race | Needs a claim row with a unique key and a lease. In-process claim + burst limit bound it to ~3 concurrent starts per account. |
| MIME spoofing: bytes are never inspected; the client chooses the `Content-Type` on the signed upload | Bounded (private bucket, owner-only). Magic-byte validation is a real change to the upload path. |
| Signed-URL minting is unbounded and unmetered (1 h TTL, shareable) | Architectural; bounding it changes how evidence playback works. |
| 404 vs 403 existence oracle on course ids | Unexploitable against a 122-bit UUID; the useful error text is worth more. |
| `announcement`/`guidance` publish without review | The fail-open on *unrecognised* kinds is fixed. Where the line sits is a product call about faculty workload. |
| Indirect prompt injection not delimited | Size is bounded at both ends. A prompt change needs a paid evaluation this pass was not authorised to run. |

---

## 6. Authenticated tests performed — **VERIFIED**

`npm run redteam:auth`, **145 assertions, 0 failures**. Four accounts created through the real API
with a random per-run password that is never printed, and deleted in a `finally`. Provider keys
blanked; a test asserts the ask path returns `degraded`/`direct` with `usage: null`, so **zero
spend is proven, not promised**.

Covered: faculty-gate behaviour (wrong code, no code, correct code), role immutability, positive
controls on every surface, cross-user isolation, privilege escalation, faculty↔faculty isolation,
conversation ownership, AI authorization, spend controls, storage, live RLS, session handling,
and the two seeded negatives for findings 8 and 9.

---

## 7. Cross-user isolation — **VERIFIED**

Student A against Course B was refused on all six read routes and all seven write/destructive
routes, with no course-B content in any response body. Student B could not read, delete, continue
or hijack Student A's conversation (404, not 403 — absent and forbidden are indistinguishable). A
course thread cannot be continued on the global surface. A lecture id from another course inside an
authorised course-ask is refused. The global corpus contained nothing from a non-member course.

## 8. Student/faculty privilege — **VERIFIED**

A student cannot create a course (403, no row written); cannot add context, upload, delete,
extract, transcribe or rule on knowledge, **even in a course they are enrolled in**; cannot upgrade
to faculty with the correct code (409); cannot re-target a profile write with a body-supplied id;
and `enrollments.role: "faculty"` grants nothing. Faculty A was refused every Faculty B resource,
and Faculty B's lecture survived the delete attempts.

## 9. AI authorization — **VERIFIED**

Refusal precedes the provider on all four paid paths, confirmed both by ordering assertions in the
offline suite and by live refusals. A pending actionable item is withheld from a student in their
own course and visible to the lecturer who must rule on it. No client input selects the provider or
model.

## 10. Spend controls — **VERIFIED** (with stated limits)

Rate limit fires (429); `?force=1` does not bypass it; concurrent extracts of one lecture yield at
most one success; a different lecture id does not reset the per-account budget; a different account
has its own budget (the documented multi-account limitation).

Honest ceiling per account per hour: ask 40 billed calls; extract 12 runs × 30 windows = 360
reasoning calls; ASR 12 jobs. Deployment-wide: 500 billed asks, 120 runs, 60 transcriptions.

## 11. Storage — **VERIFIED**

Bucket private (live check). Owner receives a signed URL that fetches; the same object **without**
its signature is refused; a forged signature is refused; another lecture's object path is
unreachable unsigned; a student gets no payload and no URL for another course's lecture; an
uploader filename cannot shape the object key.

## 12. RLS / database — **VERIFIED live**

Against the real project, with both the anon key and a genuine authenticated user JWT: **zero rows
from all 16 product tables**, for both. The JWT cannot `UPDATE` its own profile role or `INSERT` a
course. The `lecture_identity_conflicts` view leaks nothing (its `security_invoker = true` is
load-bearing and correct). Both reconstruction RPCs return nothing.

Specialist review found **no deviation** from the stated model: 16 tables, 16 `enable row level
security`, **zero** `create policy` anywhere, zero grants to `anon`/`authenticated`, no
`SECURITY DEFINER`, no definer triggers. Absence of `FORCE ROW LEVEL SECURITY` is *correct* —
`service_role` works through `BYPASSRLS`, and forcing it would lock `postgres` out of its own tables.

## 13. Migration status — **HUMAN ACTION REQUIRED**

Two migrations are written, reviewed, corrected, and **NOT APPLIED**. They cannot be applied from
here: no Docker, no psql, no local Postgres, project not linked. This is verified, not assumed.

Note: several older migrations are headed "NOT APPLIED" while the live database **has** their
tables — the files are not a reliable record of deployed state.

## 14. Secret / repository status

- **No provider key has ever been committed.** Full-history sweep: 1,424 blobs, 759 commits, all
  refs — **zero hits** for every provider-key pattern and for each live value in `.env.local`.
- **Client bundle clean.** The only credential in `.next/static` is the Supabase *anon* key, public
  by design.
- `.next/cache` holds the Sarvam and Gemini keys in cleartext — git-ignored, regenerated every
  build, documented, surfaced by `npm run verify:build-secrets`.
- **The exposed test accounts are VERIFIED ABSENT** from the live project (6 accounts remain, all
  real Google sign-ins).
- The password is **removed from all 17 files in this copy** and still present in **50 tracked
  files at HEAD** in the public repo (v1–v4 + `HANDOFF.md`), across 21 commits.

## 15. Automated test results — **VERIFIED**

| Suite | Result |
|---|---|
| `test:security` | 211 passed |
| `redteam:auth` (authenticated, live, free) | **145 passed** |
| extraction / transcript / reconstruction / knowledge-plan | 76 / 33 / 63 / 47 |
| ask / answer / auth / conversations / faculty / providers / lecture-nav | 79 / 69 / 26 / 27 / 16 / 107 / 12 |
| **Total** | **911 passed, 0 failed** |
| TypeScript · ESLint · production build | clean · clean · clean |
| `verify:storage` · `verify:build-secrets` | pass · pass |

---

## 16. Remaining risks

**Confirmed, unfixed:** the eight items in §5.
**Environmental:** both migrations unapplied; no deploy step applies migrations at all.
**Accepted trades (documented):** deployment-wide ceilings are a DoS lever; the faculty-code global
bound can block sign-up for an hour; `httpOnly:false` on the session cookie is structural.
**UNVERIFIED:** SQL syntax of both migrations against a real server; browser-level UI testing
(API-level only); anything requiring the migration to be applied.

---

## 17. Human actions required

1. **Apply the migrations.** Supabase SQL Editor or `psql`, in order:
   `20260907120000_security_hardening.sql`, then `20260907130000_ledger_durability.sql`.
   Pre-flight (read-only, free), which turns two assumptions into facts:
   ```sql
   set lock_timeout = '3s';
   select defaclrole::regrole, defaclobjtype, defaclacl
     from pg_default_acl where defaclnamespace = 'public'::regnamespace;
   select proname, proacl from pg_proc
    where pronamespace = 'public'::regnamespace and proname like '%reconstruction%';
   ```
   Both migrations `raise exception` if they did not achieve their goal, so a silent partial
   application is not possible. Verify after: `npm run test:security`, `npm run redteam:auth`.

2. **Port the credential fix to the real tree.** Copy `scripts/_test-credentials.mts` and the 17
   de-literalised files into `Projects/classmind/product/classmind-v4/`, add
   `CLASSMIND_TEST_PASSWORD` to its `.env.local` and as an empty key in `.env.example`, and commit.
   Until then the original tree still re-creates a faculty account with a published password.

3. **Retire the published password permanently.** It is in 50 files and 21 commits on a public
   repo; only a history rewrite removes it. Never reuse it. The accounts are already deleted.

4. **Confirm the production `FACULTY_ACCESS_CODE` differs from the local one.** `.env.local` labels
   its value a test value; the same string in production would put a test-grade secret in front of
   the entire privileged surface. A check, not a rotation.

5. **Decide on `.next/cache`.** It holds live provider keys in cleartext and travels with any copy
   of this folder. Rotate Sarvam and Gemini **only if** this folder, a zip, a backup or a shared
   build cache has left the machine.

6. **Strip the BOM from `.env.local`** — it breaks the Supabase CLI's env parser.

---

## 18. Final security confidence assessment

**Score: 72 / 100** (was 48).

The rise is earned by evidence, not by more fixes: the authenticated boundaries that were the
previous report's central caveat are now directly tested, and the live database state is confirmed
rather than reasoned about. The application's authorization model is genuinely strong — no
cross-user access survived a two-team adversarial pass, and the RLS posture is a clean sweep.

It is not higher because material verification gaps remain, and they are structural: **both
migrations are unapplied**, so four schema-level controls are intent rather than state; the ASR
duration ceiling and the pre-staging bypass are unfixed by choice; and the published credential
still stands in the original tree.

**This audit copy is a credible security baseline** — meaning: a documented threat model, 911
passing assertions of which 145 exercise real authenticated boundaries, a reproducible zero-spend
red team, and an honest register of what is not covered. It is **not** a statement that the
deployed product is secure: the deployed product is the original tree, which has none of these
fixes.

**Not claimed:** "fully secure", "production ready".
