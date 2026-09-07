# ClassMind — the security model

Written 2026-09-07 during an autonomous security audit of this copy. It describes
where the boundaries actually are, not where they ought to be, and it names what
is still open.

Read `CLAUDE.md` first for the money rules; this file is about access.

---

## READ THIS FIRST — the one thing code cannot fix

`DEPLOY.md` §6 records that two accounts exist in the **live** Supabase project:

    faculty.test@classmind.local
    student.test@classmind.local

with a shared password that is **hardcoded in 50 files tracked at HEAD** and
pushed to `github.com/copypastelabs262/CopyPasteLabs`, which `CLAUDE.md` states
is public. `scripts/e2e.mts:33` is one of them.

One of those accounts is **faculty**. After this audit, faculty is the role that
gates course creation and, through `requireCourseOwner`, every teaching and
every paid route. So the strongest authorization boundary in this product is
currently behind a password anyone can read on GitHub.

Everything else in this document is secondary to that. It cannot be fixed from
inside the codebase:

- Deleting the accounts is a live-data action (Supabase → Authentication → Users).
- Rotating the password is not sufficient on its own — the accounts must go, and
  the credential is permanently in public git history, so it must never be
  reused anywhere.
- The verification scripts need a credential source that is not the repository:
  read it from `.env.local` (already git-ignored) instead of a literal.

**UNVERIFIED:** whether those accounts still exist or still accept that password.
Confirming it would mean authenticating to a live system with real credentials,
which is outside what this audit is permitted to do.

---

## 0. The one fact that shapes everything

**Every product table has RLS enabled with zero policies.** The anon key can read
nothing. Every read and write in the product goes through a server route holding
the service-role key, which bypasses RLS entirely.

That is a deliberate and defensible design, and it has one consequence that has
to be stated plainly:

> **The database enforces nothing. One hundred percent of authorization is
> application code.** There is no RLS backstop. A service-role query that is not
> preceded by an explicit ownership or membership check *is* the vulnerability —
> there is no second layer to catch it.

So the audit question for any new code is never "is RLS on?" It is: **name the
line that proves this caller may touch this row.** If you cannot name it, it is
not there.

The 2026-09-07 migration (`20260907120000_security_hardening.sql`) would revoke
the blanket `anon`/`authenticated` grants that a stock Supabase project applies
to `public`, so a future table created without RLS would be unreachable rather
than world-readable. **It is not applied**, and there is no documented deploy
step that applies migrations at all — so today that safety net does not exist.

What DOES hold today, verified live against the real project on 2026-09-07 by
`npm run redteam:auth`: the anon key and a genuine authenticated user JWT each
read **zero rows** from all 16 product tables, cannot UPDATE a profile role,
cannot INSERT a course, get nothing from the `lecture_identity_conflicts` view,
and get nothing from the reconstruction RPCs. RLS-with-zero-policies is doing
the work, exactly as designed.

---

## 1. Identity

`src/lib/auth.ts :: currentUser()` is the only place identity is established.

- **Cookie session** first — how the browser authenticates. `@supabase/ssr`,
  refreshed by `src/middleware.ts` on every request.
- **Bearer token** fallback — the same session presented by something that is not
  a browser (the `scripts/verify-*.mts` suites). Verified against Supabase over
  the network, never decoded locally, so a forged or expired token fails exactly
  as an unauthenticated request does.

The role is read from `profiles`, never from the request. A missing profile is
`role: null` — a real state that routes to `/choose-role`, never a default.

`profiles.role` **still carries a database default of `'faculty'`.** Dropping it
is section 1 of `20260907120000_security_hardening.sql`, which is written and
**not applied** — so this is PENDING, not done. It is not currently exploitable:
both writers name the column explicitly (`ensureProfile`, `POST /api/profile`)
and the audit traced every call site. It is loaded rather than firing. Saying it
was fixed while the migration sits unapplied would repeat the exact drift this
audit found three times over — a comment describing an intention as a state.

Session cookies (`src/lib/supabase/cookie-options.ts`): `Secure` in production,
`SameSite=Lax`, 30-day life. `httpOnly` is **false** and cannot be changed — the
browser client reads the session to sign out. Any script execution on this origin
therefore reads the session token, which is why the CSP is a session-integrity
control here and not merely defence in depth.

---

## 2. The four authorization gates

All in `src/lib/auth.ts`. Everything else calls these.

| Gate | Asserts | Use it for |
|---|---|---|
| `requireUser()` | signed in | anything non-public |
| `requireRole(user)` | a role was chosen | role-shaped surfaces |
| `requireFaculty(user)` | `role === "faculty"` | creating a course; any faculty capability |
| `requireCourseOwner(courseId, user)` | faculty **and** owns it | every write, review, and paid route |
| `requireCourseAccess(courseId, user)` | owner (if faculty) or enrolled | every read |

**`isOwner` implies faculty.** That invariant holds in `requireCourseOwner`,
`requireCourseAccess`, and `listCourseMemberships` (which builds the global Ask
corpus). It is what keeps a leftover course owned by a student-role account from
handing that account the teaching view.

Both helpers take the **`SessionUser`**, not a bare id. An id cannot carry a role,
and a helper that has to be told the role separately is one a caller can forget to
tell.

### The gate that was missing

Until 2026-09-07, `POST /api/courses` called only `requireUser()`. Any signed-in
student could create a course, become its owner, and from that moment satisfy
`requireCourseOwner` on every teaching route behind it — upload, transcribe,
extract, review, delete. `FACULTY_ACCESS_CODE` gated who may hold the *label*;
nothing gated the *capability* the label stood for. The UI hid the button. **A
hidden button is not an authorization boundary.**

---

## 3. What a student may see

Two independent gates, both in `src/lib/knowledge/read.ts`, and neither
substitutes for the other:

- **The lecture gate** (`lectureVisibleToStudents`): `status === 'ready'` *and*
  the transcript is provably from this recording (`src/lib/provenance/replay.ts`).
  A quarantined lecture reads wrong; a replayed one reads perfectly and is simply
  someone else's lecture.
- **The item gate** (`visibleToStudents`): status `auto` or `confirmed` only.
  Actionable knowledge is invisible until a human confirms it.

Both are re-applied on **every** read — including stored conversation citations,
which freeze sources into a message at answer time. A lecturer who later rejects
an item stops it being cited in old threads too; the prose stays, because the
student did see it.

`readKnowledge` now **requires** a scope. It used to accept none, which would have
selected every knowledge item in the database.

---

## 4. Retrieval and the model

The scope is an authoritative ceiling, not a hint (`academic-context.ts`):

| Scope | Corpus |
|---|---|
| `lecture` | one lecture, after the course gate passed |
| `course` | one course, after the course gate passed |
| `global` | the caller's own memberships, enumerated **server-side** — no client id participates |

Rules that must keep holding:

- Authorization happens **before** retrieval. Filtering sources afterwards is the
  wrong shape: the model has already read the unit.
- The model is never an authorization layer. No model output selects a route, an
  id, a filter, or a permission.
- The client cannot choose the provider or the model.

**The review gate now fails closed.** `initialStatus()` in
`src/lib/knowledge/store.ts` used a deny-list: actionable *and* kind in
{assignment, deadline, exam_instruction} meant review, everything else published
automatically. Both fields come from the **model**, so any actionable item with
an unanticipated kind reached students unreviewed — and `exam_scope`, a real kind
in `extraction/types.ts`, was one of them, while `exam_instruction` does not
appear in that vocabulary at all. It is now an allow-list: everything actionable
needs a verdict unless it is explicitly `announcement` or `guidance`.

What remains: the model still chooses `category`, so an obligation it labels
`teaching` still publishes automatically. Bounding that means not trusting the
label at all, which is a product decision about how much faculty review the
product demands. See §7.

---

## 5. Spending

Cost is this product's binding constraint, so cost abuse is a security issue: an
attacker who can spend the balance can stop the product working.

Paid paths: `POST /api/lectures/{id}/transcribe` (Sarvam ASR, per hour of audio)
and anything reaching the reasoning provider — `POST /api/lectures/{id}/extract`
(per window) and the Ask routes (per question routed to the model).

Controls, in the order they run:

1. **Authorization** — `requireCourseOwner` (faculty + owner) or
   `requireCourseAccess`.
2. **Burst limit**, per user, in process (`rate-limit-core.ts`). Catches loops
   and tab fan-outs.
3. **Hourly limit**, per user, in process.
4. **Durable ledger quota** — counts what `ask_runs` / `processing_runs` say was
   actually **billed** in the last hour. Survives restarts; cannot be reset by
   spreading requests across instances. Counts `degraded` as well as `model`,
   because an attempt is a cost until proven otherwise.
5. **Single-flight claim** on `extract:{lectureId}` — `findReusableRun` SELECTs
   and `recordRun` INSERTs only after the model is paid, with no unique
   constraint between them, so two overlapping extracts of one lecture both miss
   the cache and both pay.
6. **Deployment-wide ceiling** — `enforceGlobalSpendCeiling`. Every limit above
   is keyed on the user id, and sign-up is free, so N accounts multiply the
   per-account budget by N. This one counts what the *whole deployment* was
   billed in the last hour and is the only bound an attacker cannot buy their
   way around by making more accounts. It is also a denial-of-service lever, and
   that trade is taken deliberately: an hour of refused questions is
   recoverable, an emptied balance is not. It logs loudly when it fires.
7. **Durable ASR ledger** — `enforceTranscriptionQuota`. Transcription had no
   meter table of its own, so `lectures` is used as one: a row leaves
   `pending_upload` exactly when a job is submitted. A proxy, and named as one.
8. **Length ceiling** — `MAX_WINDOWS_TOTAL = 30`, derived from
   `maxDuration = 300` on the extract route and the ~40s-per-call measurement in
   `reconstruct.ts`, **not** from taste. The window count is linear in audio
   length and audio length is chosen by the uploader. The first version of this
   cap used 120 per pass, which admitted recordings the request budget cannot
   finish — those pay for every window they manage and then get killed *before*
   `recordRun()` writes the ledger, so the next attempt pays again from zero. A
   ceiling that admits runs which cannot finish multiplies the bill instead of
   bounding it.

`?force=1` still bypasses the reuse ledger deliberately — that is what makes a
re-run a recorded experiment rather than a silent default — but it is now inside
all of the above.

---

## 6. The perimeter

`src/middleware.ts`, applied to every request:

- **Cross-site gate on `/api/*`.** `Sec-Fetch-Mode: navigate`, a document/frame
  destination, `Sec-Fetch-Site: cross-site` **or `same-site`**, or a foreign
  `Origin` is refused with 403. Nothing in this app navigates to `/api/*`; every
  client call is `fetch()`, which is always `same-origin`. This closes the class
  that `GET /api/courses/{id}/ask` was open to: SameSite=Lax cookies ride along
  on a cross-site top-level navigation, so a crafted link clicked by a signed-in
  student billed the reasoning provider. `/api/ask` had already removed its own
  GET for this reason; the reasoning was never carried across.

  `same-site` is refused too because a sibling subdomain also receives Lax
  cookies — irrelevant on `*.vercel.app` (Public Suffix List) and very relevant
  on a custom domain.

  `/api` is matched by its **own** matcher entry. The catch-all pattern excludes
  paths ending in an image or audio extension, and that exclusion is not
  path-aware: before this was split, a request to `/api/lectures/x.mp3` skipped
  the middleware entirely — gate and headers both.

  The `Origin` comparison uses the **`Host`** header, not `X-Forwarded-Host`: a
  cross-site page cannot set `Host`, so it is the trustworthy side of the
  comparison. Reading the forwarded header first would have let the same request
  forge both sides.

  Requests with **no** Sec-Fetch headers are allowed — node's fetch sends none,
  and every `verify:`/`test:` script depends on reaching these routes.
- **Nonce-based CSP.** `strict-dynamic` in production, no `unsafe-inline` for
  script. `style-src` keeps `unsafe-inline` (Tailwind/Next emit inline style and
  there is no nonce path that does not break the render); style injection is a
  defacement risk, not session theft.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY`, `Referrer-Policy:
  same-origin` (signed storage URLs and resource ids live in paths),
  `Permissions-Policy` denying the microphone, `nosniff`, COOP, and HSTS on TLS.

---

## 7. What is still open

Honest list. None of these is a known cross-user data leak.

1. **The model still chooses `category`** (§4). An obligation the model labels
   `teaching` publishes without review. The `kind` half now fails closed.
   Product decision.
2. **Cross-instance double-spend.** The single-flight claim is per process. Two
   serverless instances can still race the reuse ledger. Bounded by the burst
   limit (3 concurrent starts per account). The real fix is a claim row with a
   unique key and a lease, in the shape `reconstruction_windows` already uses.
3. **Rate limits are per-instance for layers 2–3.** Layer 4 (the durable ledger)
   is the backstop and is not resettable, but it only counts what was billed —
   so it lags by one request.
4. **Multi-account abuse.** Google sign-up is free and unlimited, so every
   per-user limit multiplies by the number of accounts an attacker creates.
   Bounding this needs an account-creation control, which is an operator
   decision.
5. **`httpOnly: false` on the session cookie** (§1). Structural, given the
   browser client. CSP is the mitigation.
6. **The faculty gate can be denied.** The new global bound on
   `FACULTY_ACCESS_CODE` failures (100/hour, `src/lib/faculty-code.ts`) means a
   determined attacker can block faculty sign-up for up to an hour. Accepted
   trade: an hour's delay is recoverable, an unbounded guessing budget against
   the product's only privilege gate is not. The refusal is logged loudly.
7. **Indirect prompt injection is bounded, not prevented.** Transcript-derived
   text is still interpolated into the Ask prompt without a delimiter or an
   "this is data, not instructions" frame. Its *size* is now bounded at both the
   write path and the renderer, which closes the cost-amplification half. The
   remaining half — a course owner influencing what ClassMind says, including to
   a student who shares that course and another — needs a prompt change, and
   validating a prompt change needs a paid evaluation run this audit was not
   authorised to make.
8. **Migrations are not part of the documented deploy.** `DEPLOY.md` describes
   env vars and OAuth but no `supabase db push`, so every schema-level control —
   including `20260907120000_security_hardening.sql` — is applied by hand or not
   at all. Several migration files are also headed "NOT APPLIED" while the live
   project demonstrably has those tables, so the files cannot be trusted as a
   record of what is deployed.
9. **Every build writes live API keys into `.next/cache` in cleartext.**
   Turbopack's persistent cache stores the environment values it resolved, and
   it does so again on every build -- deleting the cache is housekeeping, not a
   fix. `.next` is git-ignored, so this is NOT published; what remains is that
   `.env.local` was deliberately kept out of the repo while the same values sit
   in an artefact nobody thinks of as secret. Zipping the project, uploading a
   CI artifact, or enabling a shared/remote build cache carries live Sarvam and
   Gemini keys off the machine. Treat `.next` as secret-bearing.
   `npm run verify:build-secrets` reports it, and asserts the thing that must
   never happen: no server secret in `.next/static` (the client bundle).
10. **`announcement` and `guidance` still publish to students without review.**
   The gate now fails closed on an *unrecognised* kind, which was the security
   defect, and `exam_scope` is now gated. These two remain ungated because that
   matches the original product intent (a professor cannot review thirty items
   per lecture). If an "announcement" can move an exam date, revisit it -- that
   is a product call about review burden.
11. **The security-hardening migration is not applied**, and cannot be applied
   from here: this machine has no Docker, no psql and no local Postgres, and the
   Supabase project is not linked. Applying it needs a human with the SQL editor
   or a database password. Until then, sections 1-4 of it are intent, not state.

*(The previous entry here -- "nothing has been verified against an authenticated
live session" -- is closed. `npm run redteam:auth` now creates four throwaway
accounts through the real API, exercises cross-user isolation, privilege
escalation, conversation ownership, AI authorization, spend limits, storage and
live RLS, and deletes everything it made. 139 assertions, 0 failures.)*

---

## 8. Running the checks

```
npm run test:security     # offline security regressions. Free.
npm run test:auth         # role-selection contract
npm run test:faculty      # the faculty gate
npm run verify:storage    # live, read-only, free: is the lecture bucket private?
npm run verify:build-secrets  # free: is a server secret in the client bundle?
npm run redteam:auth      # AUTHENTICATED red team. Free, but LIVE: it creates and
                          # deletes four throwaway accounts in the real project.
                          # Start the server with the provider keys BLANK first:
                          #   GEMINI_API_KEY= SARVAM_API_KEY= npx next start -p 3599
npx tsc --noEmit && npx eslint src/
```

`test:security` is free and offline by construction — it imports only pure
modules and checks the rest by reading source. Everything in it is a **fixed
vulnerability**, so a failure names the hole that just reopened.

The live equivalents (`verify:auth`, `verify:conversations`) need `.env.local`
and a running server; they are free but real. Everything on the paid list in
`CLAUDE.md` still needs Shyam's approval, per run.
