# 2026-09-06 — Full engine audit against the live DB; v1.2.0 closes R1, R2 and the audience gap

**Spend this session: $0.** Every verification below was a free read (Supabase service-role
head-counts and selects, code inspection, offline suites). No Sarvam call, no Gemini call.
Two paid validation runs are **proposed and awaiting per-run approval** — see "Blocked".

## What was verified (against the database, not memory)

- **The Ask meter is live and correct.** `ask_runs` holds three rows from the operator's
  2026-09-04 session: two `direct` routes at $0 with full unit counts (18 ms and 3 ms), one
  `model` route (`gemini-3.5-flash-lite`, 901 prompt + 51 completion tokens, request id
  captured). That is the operator's entire Ask spend to date: **~952 tokens ≈ well under a
  cent.** Routing behaved exactly as designed on all three.
- **The Gemini baseline stands.** Ledger `77408ea3` (2026-09-01): 20/20 windows, 27,979
  tokens, 118.7 s, `succeeded`/`complete`. 26 knowledge items, 35 verified evidence rows.
  The v1.0.0 confirmed research-paper assignment survived alongside the v1.1.0 pass.
- **The Robotics recording is NOT pending — it was fully processed on 2026-09-01.** The
  .aac upload failed on the MIME bug (fixed then); the .mp3 re-upload transcribed
  (`saaras`, honest 0.421 supported-rate on unclear audio) and extracted clean: ledger
  `6ac53dca`, 7/7 windows, 5,993 tokens, 4 items incl. the pending-review Transformation
  Assignment with verbatim Hinglish evidence ("Aur five times likhna hai", deadline
  exchange at ~440 s). The transcript is sparse (1,843 chars vs 22,445 for the 23-min
  baseline) — the chaotic multi-speaker tail of the class defeated ASR, the clear
  lecturing segments came through. No new upload exists after 2026-09-04.
- **R1 / R2 / audience were still present** (code + data): teaching pass had no dedupe
  (live duplicate pairs confirmed in `knowledge_items`), `model_raw` was null on all 82
  items, no audience field anywhere.
- **Migrations:** `ask_runs` applied; **`reconstruction_jobs` (20260830140000) NOT
  applied** — harmless today because the extract route doesn't use it, but a background
  job path will need it (the 36-minute ceiling).
- **Spend safety:** no auto-transcribe path exists — `POST /transcribe` has exactly one
  caller, the upload form. A `pending_upload` row triggers nothing. The one live-billing
  edge: a lecture sitting in `transcribing` auto-polls and auto-extracts on completion;
  no lecture is in that state.
- **Duplicate-lecture cost leak (new observation):** DBVC was uploaded twice as two
  lecture rows; Sarvam transcribed both, producing *different* transcript hashes, so the
  ledger correctly saw two inputs and billed two full extractions (~31K tokens each). The
  idempotency key works as designed; audio-level dedupe before transcription is the
  missing guard. Worth a roadmap line, not an emergency.

## Student→Faculty role bug — diagnosed, not yet fixed

Every dropped signal fails toward Faculty, silently, in five independent places (UI
default, callback fallback, `/api/profile` coercion, schema default, session fallback).
The reproducible-from-clean-visit path: the **role toggle renders only in signup mode**
(`signin/page.tsx:107`), while "Continue with Google" sits above it and outside it — a
Google user can never select Student; the initial `role` state (`"faculty"`, line 25) is
forwarded and written. Insert-only guard means no later sign-in corrects it. Secondary
paths: email-confirmation flow skips the `/api/profile` call (`user_metadata.role` is
written but never read back), and the Supabase redirect-allowlist trap (DEPLOY.md §)
strips `?role=` — the recorded 2026-08-31 failure. Live data corroborates: all five real
Google profiles are `faculty`, including a founder who signed up on 2026-09-04.
**Recommended fix (separate change, not in the v1.2.0 batch):** show the role choice to
every first-time user regardless of mode/provider, read `user_metadata.role` in the
callback as the fallback before defaulting, and default the UI toggle to Student (the
common case; Faculty is the privileged role and should be the deliberate choice).

## What changed (one controlled batch → reconstruction v1.2.0)

`classmind-v4`, all offline-verified, no prompt/window/provider changes beyond the batch:

1. **R1 closed.** Dedupe now runs on every category (within-category only — an assignment
   and the teaching item explaining it legitimately share a span). Root cause pinned in a
   test: a segment straddling the 180 s stride is fed to both adjacent teaching windows.
2. **R2 closed.** Each stored item now carries the model's literal item object in
   `knowledge_items.model_raw` (column existed since 20260823, never written). Full
   per-window response bodies still have no home — that needs the jobs table; noted, not
   snuck in.
3. **Audience captured.** Actionable contract gains a required `audience` string (empty =
   "never said" → null); prompt instructs verbatim capture, never guessing, gap routed to
   `unspecified`. New migration `20260906090000` adds the column. `readKnowledge` and
   `storeKnowledge` degrade gracefully while it is unapplied. Ask's audience intent now
   answers from the stored field or names the gap honestly (old canned text claimed the
   contract *couldn't* capture audience — no longer true, so it changed).

Tests: 396 offline checks green (12 new), tsc and eslint clean. Roadmap ticked for Ask
routing / honest gaps / meter (2026-09-03) and audience/R1/R2 (today, validation pending).

## Blocked (operator decisions)

1. **Apply migration `20260906090000_knowledge_audience.sql`** (one `alter table add
   column`). Before the validation runs, or audience data silently degrades away.
2. **Approve validation run A** — re-extract the Cloud Computing baseline (`dfd7312d`) at
   v1.2.0: Gemini reasoning, ~20 calls, ~28K tokens. Proves the new contract reproduces
   the baseline, merges the two duplicate pairs, fills `model_raw`.
3. **Approve validation run B** — re-extract Robotics (`87a4a143`) at v1.2.0: ~7 calls,
   ~6K tokens. The audience test: the transcript names the assignees; the item should now
   carry them, and "who is the assignment for?" should answer at $0.

No Sarvam spend in either (stored transcripts; ~90 credits untouched).

## Addendum (same day, later): the Student→Faculty role bug is FIXED and verified

Operator approved the full sequence (auth fix → migration → validation A → inspect → B)
and made the auth fix priority one. Runs A and B are now approved, gated on the migration.

**The fix (one architecture, five fallbacks removed).** The profiles row is the single
source of truth, written only by explicit role-selection events:

- The sign-in page's role toggle starts UNSELECTED; email sign-up requires a choice.
- The role selected before "Continue with Google" travels as a short-lived, single-use
  cookie (`cm-pending-role`, 10 min, consumed and deleted by the callback) — NOT a query
  param, because Supabase's redirect allow-list glob silently drops non-matching query
  strings (the recorded 2026-08-31 failure that created students as faculty).
- Provisioning is ONE function, `ensureProfile` (`src/lib/profile.ts`), insert-only —
  an existing row is never overwritten by any sign-in path. The pure decision
  (`planProfileProvision`, `src/lib/profile-role.ts`) has its truth table pinned in
  `test:auth`. Precedence: existing row > pending cookie > `user_metadata.role`
  (recorded at email sign-up; covers the email-confirmation detour) > ASK.
- An authenticated account with no recorded selection is sent to **/choose-role** —
  a real page, no preselection — never defaulted. `SessionUser.role` is now nullable;
  `requireRole` refuses role-shaped APIs with a 403 naming /choose-role; `/api/profile`
  requires an explicit valid role at creation (400 otherwise) and refuses to change an
  existing role (409). `currentUser()`'s "missing profile means faculty" is gone.

**Verified** ($0, real database, real server): `test:auth` 25/25 offline;
`npm run verify:auth` 21/21 live — throwaway accounts driven through ensureProfile and
the HTTP APIs covering all five operator scenarios: A (Google+student → student),
B (Google+faculty → faculty), C/D (re-sign-in keeps the role, hostile stray signals
ignored), E (no signal → no row, 403 from role-shaped APIs, 400 on invalid role, then
the explicit choice creates the row; a later role flip is refused 409). Full free suite
after: 421 checks green, tsc/eslint/`next build` clean. **Not verified live:** the Google
consent browser leg itself (simulated at the exact function the callback runs); a human
click-through needs `http://localhost:3500/**` on the Supabase redirect allow-list.

**Existing accounts untouched** — the five real Google-signup profiles are all still
`faculty`; if any founder account was meant to be a student, flipping it is a deliberate
operator-approved data fix, one UPDATE away.

**Migration application is blocked on credentials**: this machine has no psql, no
supabase CLI, no DB connection string — only the service-role key, which speaks PostgREST
and cannot run DDL. The operator applies the one-line `alter table` in the SQL editor
(same way `ask_runs` was applied), then runs A → inspect → B proceed.

**Autosave note:** the root autosave hook committed and pushed each auth-fix file as it
was written (`Auto-save:` stream) — review-before-push wasn't possible under it. Post-hoc
sweep of everything pushed since `22c9f01`: exactly the 17 authored files, no secrets, no
env files, no recordings. The intentional commit closing this addendum carries the story.
