# Background reconstruction

**Status:** design, not built. Nothing under `src/` has been changed.
**Date:** 2026-08-30
**Scope:** `Projects/classmind/product/classmind-v2`

---

## 1. The problem, measured

Knowledge reconstruction (Layer 2) runs on the HTTP request path, inside
`src/app/api/lectures/[id]/extract/route.ts`, which declares `maxDuration = 300`.
`src/lib/reasoning/reconstruct.ts:139-150` records the measured cost at
`CONCURRENCY = 4` and roughly 40s a call:

| Lecture | Calls (actionable + teaching) | Wall clock | Result |
|---|---|---|---|
| 23 min | 12 + 8 = 20 | ~200s | fits |
| 36 min | 18 + 12 = 30 | ~300s | at the limit |
| 50 min | 25 + 17 = 42 | ~440s | **times out** |
| 90 min | 45 + 30 = 75 | ~760s | **times out** |

A normal college lecture is 45-60 minutes. The product cannot process a normal
lecture. `reconstruct.ts:150-151` already names the answer: *"the answer is to
move reconstruction off the request path into a background job, not to raise
this number."*

---

## 2. Constraints established before choosing anything

Each of these was checked, not assumed. Several came back different from what
the repository claims.

### 2.1 Vercel function duration is 300s on every plan, 800s only on Pro

`DEPLOY.md:255` says `maxDuration = 60` "is the Hobby ceiling". **That is stale.**
Since Fluid Compute became the default execution model, the limits are:

| Plan | Default | Max |
|---|---|---|
| Hobby | 300s | **300s** |
| Pro | 300s | 800s |
| Enterprise | 300s | 800s |

So `maxDuration = 300` in the extract route is legal on Hobby as well as Pro,
and the transcribe route's `60` is conservative rather than required.

**This does not rescue the design.** Even 800s — which needs Pro — buys a 90
minute lecture with about 5% headroom and buys nothing at all for a two-hour
one. The cost grows with lecture length; the ceiling does not. Raising
`maxDuration` is not a fix, it is a different length at which the same failure
happens, and it makes the failure worse: a request that dies at minute nine has
written nothing, so the entire pass repeats from zero.

### 2.2 Vercel Cron exists on every plan, but on Hobby it runs **once per day**

| Plan | Cron jobs / project | Minimum interval | Precision |
|---|---|---|---|
| Hobby | 100 | **once per day** | ±59 min |
| Pro | 100 | once per minute | per-minute |

A cron expression that would fire more than once a day **fails at deploy time**
on Hobby — it does not silently degrade, it breaks the build.

This is the single most important constraint, and it eliminates the most
obvious architecture. A cron-drained queue is unusable as the *driver* of an
interactive flow if the deployment might be on Hobby: the teacher uploads a
lecture and waits until tomorrow.

Nothing currently uses cron. There is no `vercel.json` anywhere in v2, no
`crons` key, and no `CRON_SECRET`.

### 2.3 The plan for classmind-v2 could not be determined — and the design does not need it

- `DEPLOY.md` documents the **v1** deployment. `DEPLOY.md:18` gives
  `Root Directory: Projects/classmind/product/classmind-v1`, and the live URL at
  `DEPLOY.md:3` is that project.
- There is no `.vercel/` directory and no `vercel.json` in v2.
- `git status` reports the entire v2 tree as untracked (`?? Projects/classmind/product/classmind-v2/`).
- The `vercel` CLI is not installed on this machine (`command -v vercel` → exit 1),
  so the account could not be queried.

**Conclusion: classmind-v2 has never been deployed, and the plan is unknown.**
The design is therefore built to be correct on Hobby and merely faster on Pro.
Anything that only works on Pro is rejected on that ground alone — a mechanism
that works in development and is dead in production is the worst available
outcome.

### 2.4 The status machine already has the state, and nothing writes it

`lectures.status` (core migration lines 63-65, widened by
`20260830100000_transcript_quarantine.sql:21-24`):

```
'pending_upload','uploaded','transcribing','transcribed',
'extracting','ready','failed','quarantined'
```

`extracting` is in the constraint and is **never written by any code**. But the
UI is already fully wired for it:

| Surface | Evidence |
|---|---|
| `LectureClient.tsx` `WAITING_COPY.extracting` | "Understanding the lecture" / "Connecting concepts and identifying important information." |
| `LectureClient.tsx` `isWorking` | includes `extracting` |
| `ui/index.tsx:629` | `lectureStatusTone('extracting') → 'busy'` |
| `ui/index.tsx:656` | note: "Reading the transcript for what was taught." |
| `LectureUpload.tsx:16,52` | a real `extracting` phase, mapped to step 2 "Understanding the lecture" |

The human-language state this design needs already exists, is already written,
and is already reachable. Only the write is missing. **No migration is needed to
the `lectures` table at all.**

### 2.5 The client already drives processing, and there is no worker

`LectureProgress.tsx` polls `POST /api/lectures/{id}/poll` every 5000ms while
`status === 'transcribing'`, absorbs two consecutive failures in silence
(`QUIET_FAILURES`), and calls `onAdvanced()` to refetch. `LectureUpload.tsx`
runs the same loop inline with `MAX_POLLS = 240` (20 minutes).

Both then call `POST /extract` and **await it synchronously**. That await is the
blocking call this design removes.

`LectureProgress.tsx` documents the existing philosophy explicitly: *"There is
no worker process: provider_job_id lives on the lecture row, so advancing a
lecture is just 'someone with the owner's session asks again'."* It also already
tells the teacher the truth about it: *"This keeps running while the page is
open, and picks up where it left off if you come back later."*

`LectureProgress` renders `null` for `extracting` today.

### 2.6 `storeKnowledge` is re-run safe but **not** concurrency safe, and not chunkable

`src/lib/knowledge/store.ts` + `src/lib/knowledge/plan.ts`:

- **Re-run safe, sequentially.** `planKnowledgeWrite` deletes machine-derived
  rows (`auto`, `pending`) and re-inserts, while preserving human verdicts
  (`confirmed`, `rejected`) matched by evidence-span overlap ≥ 0.5 (`span.ts`,
  `DUPLICATE_OVERLAP`). Re-running does not duplicate and does not re-open a
  verdict.
- **Not concurrency safe.** It is read-existing → delete → insert, with no lock
  and no transaction. Two overlapping runs interleave into duplicates, or one
  deletes the other's fresh inserts.
- **Not chunkable.** It takes the whole lecture's `items[]` plus one `complete`
  boolean. Calling it per batch would make batch 2 delete batch 1's rows. Its
  return value `total = keptCount + stored` is the *only* contract with
  `decideReadiness`, and `plan.ts` says so.

This shapes the design more than anything else: **the chunking must happen
strictly upstream of `storeKnowledge`, which is then called exactly once.**

---

## 3. Target flow

```
upload → transcribe → validate ─┬─ reject → quarantined            (unchanged)
                                │
                                └─ accept → transcribed
                                              │
                        POST /extract  ───────┤  Layer 1 candidates (unchanged, fast)
                                              │  ENQUEUE reconstruction job
                                              │  lectures.status := 'extracting'
                                              │  returns 202 immediately
                                              ▼
                            reconstruction_jobs (queued)
                            reconstruction_windows × N (pending)
                                              │
        POST /reconstruct  ◄──────────────────┤  drained repeatedly:
        (client poll, 5s, existing shape)     │  claim ≤4 pending windows,
        GET  /api/cron/reconstruct            │  run them, write items jsonb,
        (daily backstop)                      │  return progress, exit < 300s
                                              ▼
                              every window terminal
                                              │
                                    state := 'storing'   (won by exactly one caller)
                                              │
                        dedupe + sort  →  storeKnowledge(...)  ← ONE call, unchanged
                                              │
                                      decideReadiness(...)     ← unchanged
                                              │
                            ready ──► lectures.status := 'ready'
                        not ready ──► lectures.status := 'transcribed'
                                      lectures.error_message := readiness.reason
```

---

## 4. The mechanism, and why

### Recommended: a durable window queue in Postgres, drained by the client's existing poll, with a daily cron sweep as a backstop

Three parts.

**1. `POST /extract` stops doing Layer 2.** It keeps doing Layer 1 exactly as it
does now (that is offline pattern matching and costs milliseconds), then
enqueues a `reconstruction_jobs` row, seeds one `reconstruction_windows` row per
window, sets `lectures.status = 'extracting'`, and returns `202` with the job's
progress. It never calls the model.

**2. `POST /api/lectures/[id]/reconstruct` is the drain.** Owner-authenticated
like every other lecture route. It takes the job lease, retires exhausted
windows, claims up to `CONCURRENCY` (4) pending windows, runs them through the
*existing* single-window path, writes each window's verified items to its own
row, and returns `{done, total, failed, state, status}`. It stops when a soft
budget (~120s) is reached, well under the 300s ceiling that holds on every plan.
When it observes that every window is terminal it wins the transition to
`storing` and performs the single `storeKnowledge` + `decideReadiness` call.

**3. `GET /api/cron/reconstruct` is a recovery sweep, not the driver.** Once a
day (`"0 3 * * *"`, the only frequency that deploys on Hobby), it picks up jobs
whose `last_progress_at` is stale and drains them. On Pro this one line becomes
`"*/5 * * * *"` and the product gets a real background worker for free.

### Why this and not the alternatives

**Why not Vercel Cron as the driver?** Because on Hobby it fires once a day, and
the plan is not established (§2.3). A design whose primary mechanism is silently
24-hours-latent on the plan we might actually be on is not a design, it is a
trap. Cron is kept, in the role where once-a-day is genuinely useful: rescuing
work nobody is watching.

**Why not a self-invoking function chain?** It works on any plan, but a chain
that dies — a deploy mid-run, a cold-start failure, a 500 — is dead forever,
because the only thing that would have restarted it was the invocation that
died. It also needs the deployment's own URL and a shared secret, and
`DEPLOY.md:211` confirms Deployment Protection is on for preview deployments,
which is exactly where a self-fetch stops working in a way that is hard to
diagnose. The client poll gives the same "keep going" behaviour with a restart
mechanism that is a human refreshing a page.

**Why not Supabase Edge Functions / pg_cron?** pg_cron cannot call the model at
all; it would need an Edge Function, which is a second runtime (Deno) holding a
second copy of `reconstruct.ts`. That file *is* the safety mechanism — bounded
input, quotes verified against their own window, items discarded rather than
repaired. Two copies of a safety mechanism is one copy of a safety mechanism and
one copy of a future bug.

**Why not QStash, Inngest, or Vercel Queues?** All three are correct. All three
are a new dependency, a new vendor, a new secret, a new webhook surface, and (for
Queues) per-operation billing, in order to serialise work for a product with one
deployment and one user. Vercel Queues in particular is a good future answer —
it is native, it has visibility timeouts and retry backoff that mirror what is
hand-rolled here — and it is the right thing to reach for the day the browser
tab being the worker actually costs something.

**Why Postgres for the queue?** Supabase is already the only stateful thing in
this system, `serviceClient()` already exists as the single privileged writer,
and RLS-on-with-no-policies already makes these tables unreachable by students
for free. The queue is four columns and two SQL functions. It adds no runtime,
no vendor, and no secret.

### Why the drain invocations are short

Total wall clock is model-bound, not invocation-bound: `calls × 40s ÷ 4`
regardless of how the work is split across HTTP requests. A 50-minute lecture is
~440s of model time whatever we do. So there is no reason to prefer long
invocations, and two reasons to prefer short ones: a dropped request costs at
most one batch, and the client gets a real progress number every ~45s instead of
holding a 4-minute fetch open on a phone.

`CONCURRENCY` stays at 4. `reconstruct.ts:157-161` refuses to raise it without
measuring the provider's rate limit, on the grounds that a 429 storm loses
windows silently — the same invisible-failure class the whole file exists to
remove. That reasoning is still correct and this change does not touch it.

---

## 5. Surviving a crash

The unit of durable progress is the window, because the window is already the
unit of independent work: a bounded excerpt, read alone, with its quotes
verified against itself.

- **Every finished window is durable immediately.** Its verified
  `ReconstructedItem[]` is written to `reconstruction_windows.items` in one
  statement, before anything else happens. Verification has already occurred by
  then, so what is stored is the *output* of the safety mechanism, not model
  output awaiting one.
- **A crash costs at most the in-flight batch** — four windows, ~40s of work.
- **Recovery needs no separate path.** A `running` window whose
  `lease_expires_at` has passed is claimed by the same predicate that claims a
  `pending` one. A dead worker and a slow worker are indistinguishable from
  outside, so they are treated identically.
- **`attempts` is incremented at claim, not at completion.** A window that
  reliably kills its worker would otherwise be retried forever. At
  `attempts >= 3` it is retired to `failed` with its error.
- **Character offsets stay valid** because the transcript is immutable — the
  whole system is built on `raw_transcription_response` never being edited.

A resumed job therefore redoes only what was in flight, and loses only what a
model refused to produce three times.

---

## 6. Idempotency and duplicate jobs

> *Two enqueues for one lecture must not produce duplicate knowledge.*

Four independent guards, in order of when they fire.

**1. One job per run.** `unique (lecture_id, reconstruction_method,
reconstruction_version)`. Enqueue is `insert … on conflict do nothing` followed
by a select. Two simultaneous `POST /extract` calls produce one job row; the
loser reads the winner's progress. This is the same guard shape the extract
route already uses for Layer 1 ("has this exact method+version already read this
lecture").

**2. At most one *live* job per lecture, whatever the version.** A partial
unique index on `lecture_id where state in ('queued','draining','storing')`. Guard
1 collapses identical enqueues; this one stops a *different* run — a deliberate
re-process with an upgraded reasoner — from racing an unfinished one. Two live
runs would both reach `storeKnowledge`, and the second would delete the first's
machine-derived rows: correct behaviour, applied to a lecture that was never
finished.

**3. One row per window, and windows are deterministic.** `unique (job_id, pass,
start_ms)`. `windowStarts()` is pure and the transcript is immutable, so seeding
the same job twice produces exactly the rows already present. Seeding is
`on conflict do nothing` and is safe to repeat after a crash mid-seed.

**4. Exclusive claims, as compare-and-swap.** Both claims are a single `UPDATE …
RETURNING` with the old state in the `WHERE` clause, so Postgres row locking
decides the winner:
- the **job lease** means a second open tab is a reader, never a second worker
  (which would put 8 concurrent calls on a provider whose rate limit is
  deliberately unmeasured);
- the **window claim** uses `FOR UPDATE SKIP LOCKED`, so two drains that somehow
  both hold work never touch the same window.

**And the terminal write happens exactly once.** The transition to `storing` is
itself a compare-and-swap (`… where id = ? and state = 'draining'`); only the
winner calls `storeKnowledge`. Note that even if this were defeated,
`planKnowledgeWrite` would still not duplicate — a second call deletes the
first's machine-derived rows and inserts the same set — but the design does not
lean on that. Defence in depth, not defence by luck.

Both claim functions evaluate `now()` **in the database**, not in a serverless
function, so a lease cannot be taken early or held late because two machines
disagree about the time.

---

## 7. Honest failure states

`decideReadiness` and its four not-ready codes are **not modified**. It already
distinguishes "nothing to find" from "we failed to look", and everything this
design produces maps onto the existing codes:

| Job outcome | `decideReadiness` input | Code | Lecture ends as |
|---|---|---|---|
| all windows done, knowledge stored | `knowledgeTotal > 0` | `ok` | `ready`, `error_message = null` |
| no model configured at enqueue | `reasoningAvailable: false` | `reasoning_unavailable` | `transcribed` + reason |
| no windows could be seeded (no timeline) | `windows: 0` | `nothing_to_read` | `transcribed` + reason |
| some windows permanently failed, nothing stored | `complete: false` | `reconstruction_incomplete` | `transcribed` + reason |
| every window read, model returned nothing | `complete: true`, `total 0` | `no_knowledge_found` | `transcribed` + reason |
| some windows failed but others produced knowledge | `knowledgeTotal > 0` | `ok` | `ready` — a partial failure does not become a total one |

`complete` and `windows` are now computed from `reconstruction_windows` rows
instead of from an in-memory `stats` object, and mean exactly the same thing:
`complete = (failed_windows === 0)`, `windows = total_windows`.

**One new bug this change introduces, and how it is handled.** Today the extract
route leaves `lectures.status` untouched when not ready, and that is safe only
because the row is still `transcribed`. Once the row is moved to `extracting`,
a not-ready outcome that forgot to move it back would strand the lecture in a
busy state forever, showing a spinner that never resolves. **The finalizer must
set `status = 'transcribed'` explicitly on every not-ready path.** That is the
single most likely way to get this wrong.

**A stalled job is not a failed job.** A job in `draining` whose
`last_progress_at` is more than ~10 minutes old has not failed — nobody is
driving it. The lecture is genuinely still `extracting`. The UI says so in those
words rather than inventing an error (§8), and the daily sweep picks it up.

---

## 8. What the teacher sees

Nothing new has to be invented. The states already exist and already read well.

**While it runs** — `lectures.status = 'extracting'`, which every existing
surface already renders:

> **Understanding the lecture** — connecting concepts and identifying important
> information.

**One addition, because the wait is now minutes rather than seconds.** A spinner
that does not move for eight minutes reads as a hang. `LectureProgress` gains
one real, measured number from the drain response:

> **Understanding the lecture** — connecting concepts and identifying important
> information. *18 of 42 sections read.*

That is a count of terminal windows, not a synthetic percentage. It is honest
about being an estimate of nothing: it says what has been read.

**When nothing is driving it** — after ~10 minutes of no progress with the job
still `draining`, in the same quiet register as the existing "Still checking —
the connection is slow just now.":

> Paused — this will pick up again the next time you open this lecture.

Which is true, is actionable, and matches the sentence the component already
shows during transcription: *"This keeps running while the page is open, and
picks up where it left off if you come back later."*

**When it finishes** — unchanged. `ready`, and "Key content" fills in.

**When it does not** — unchanged. The lecture returns to `transcribed`, carries
`readiness.reason` written for a faculty member, and `LectureProgress` shows the
existing "Finish processing" button, which now re-enqueues.

**During upload** — `LectureUpload` already has step 2 "Understanding the
lecture" and a `FailureKind: "understand"`. It stops awaiting `/extract` and
polls `/reconstruct` instead, in the loop it already has.

---

## 9. The migration

Written to
`Projects/classmind/product/classmind-v2/supabase/migrations/20260830140000_reconstruction_jobs.sql`.
**Written, not applied.**

Additive only: two new tables, five indexes, three SQL functions, RLS and grants
in the existing house pattern. It drops nothing, rewrites nothing, and touches
no existing table — **not even `lectures`**, because `extracting` is already in
the status CHECK constraint (§2.4).

See the file for the full SQL and its commentary. In outline:

- `reconstruction_jobs` — one row per run; holds `state`, the job lease,
  `total/done/failed_windows`, `last_progress_at`, and the readiness reason.
  - `unique (lecture_id, method, version)` — idempotent enqueue.
  - `unique (lecture_id) where state in ('queued','draining','storing')` — at most one live job.
- `reconstruction_windows` — one row per window; holds `pass`, `start_ms`,
  `state`, `attempts`, the window lease, `items jsonb` (verified items), `error`.
  - `unique (job_id, pass, start_ms)` — deterministic identity, safe re-seed.
- `claim_reconstruction_job(job, lease_seconds)` — CAS on the job lease.
- `claim_reconstruction_windows(job, limit, lease_seconds, max_attempts)` —
  `FOR UPDATE SKIP LOCKED` claim over pending and lease-expired windows.
- `retire_exhausted_reconstruction_windows(job, max_attempts)` — permanent
  failure for windows that used up their attempts.

---

## 10. What I would not do, and the trade-off being accepted

**I would not raise `maxDuration` to 800.** It requires Pro, which is not
established. It buys a 90-minute lecture at ~5% headroom and nothing beyond. And
it makes failure worse rather than better: a 13-minute hanging request that a
phone on a campus network will drop, after which nothing is recoverable because
no progress was ever durable. The length ceiling would move; the shape of the
failure would not.

**I would not raise `CONCURRENCY` above 4.** `reconstruct.ts:157-161` refuses to
guess the provider's rate limit and explains why: a 429 storm mid-lecture loses
windows silently, trading a known ceiling for an unknown one. That is a separate
change and it comes with a measurement, not with this one.

**I would not make cron the driver.** On Hobby it is once a day (§2.2). It works
in development, it works on Pro, and it is invisible on Hobby — the exact
failure mode this codebase keeps writing comments about.

**I would not stream partial knowledge into `knowledge_items` as windows
finish.** It would let a student read half a lecture presented as a whole one,
and it would break `planKnowledgeWrite`: batch 2 would delete batch 1's rows.
The `complete` flag is the entire reason that function exists.

**I would not modify `storeKnowledge`, `planKnowledgeWrite`, or
`decideReadiness`.** They encode two production failures — an incomplete pass
deleting a complete one's work, and a lecture with nothing in it being published
as ready — and they are pure and tested offline. The chunking goes upstream of
them.

**I would not add a real worker process** (Railway, Render, Fly). It is the
correct answer at scale and the wrong answer now: a second deploy target, a
second set of secrets, a second thing that can be down, for an MVP.

### The trade-off, stated plainly

**The teacher's open tab is the worker.**

A 50-minute lecture takes roughly 7-8 minutes of wall clock, and a page has to
be open for it — or reopened later, at which point it resumes rather than
restarts. On Hobby, the automatic backstop for a closed tab fires once a day; on
Pro it can be every five minutes by changing one line in `vercel.json`.

**What that buys:** lectures of any length now finish. Nothing is lost to a
crash, a deploy, or a closed laptop. No new dependency, no new runtime, no new
vendor, no second copy of the safety mechanism. The UI language, the status
machine, and the readiness contract are all already written.

**What it costs:** time-to-ready is minutes rather than seconds, and it depends
on someone having a page open. That is not new — it is exactly how transcription
already works in this product, and the UI already says so in the teacher's own
words. What *is* new is that a closed tab no longer means a lecture sits in
`transcribed` forever, which is the state `LectureProgress.tsx` currently
describes as "the state a closed tab leaves behind".

The honest summary: this design does not remove the dependency on a browser tab.
It makes that dependency survivable, resumable, and visible, and it removes the
length ceiling entirely. Removing the tab dependency is a worker process or a
managed queue, and it is the right next step the day this one starts to hurt.

---

## 11. Implementation plan

Ordered. Risky steps named. **Steps 3-7 touch files another agent is editing
right now (`src/lib/reasoning/**`, `src/app/api/lectures/**`) and must not begin
until that work has landed.**

| # | File | Action | Risk |
|---|---|---|---|
| 1 | `supabase/migrations/20260830140000_reconstruction_jobs.sql` | **written, not applied** | — |
| 2 | apply the migration to Supabase | `supabase db push` or dashboard | low — additive only, no existing table touched |
| 3 | `src/lib/reasoning/windows.ts` | **new.** Pure: `planWindows(transcript) → {pass, startMs, endMs}[]`, built from the existing `windowStarts` / `windowFor` | **medium** |
| 4 | `src/lib/reasoning/reconstruct.ts` | **modify.** Extract the `runWindow` closure into an exported single-window function returning `{items, error}` | **HIGH — see below** |
| 5 | `src/lib/reasoning/jobs.ts` | **new.** All job/window DB I/O: enqueue, seed, claim, record, finalize | medium |
| 6 | `src/app/api/lectures/[id]/reconstruct/route.ts` | **new.** The drain. `maxDuration = 300` | medium |
| 7 | `src/app/api/lectures/[id]/extract/route.ts` | **modify.** Layer 1 unchanged; Layer 2/3 → enqueue + `status='extracting'` + `202` | **HIGH — see below** |
| 8 | `vercel.json` | **new.** `{"crons":[{"path":"/api/cron/reconstruct","schedule":"0 3 * * *"}]}` | **HIGH — see below** |
| 9 | `src/app/api/cron/reconstruct/route.ts` | **new.** `CRON_SECRET` bearer check, then drain stale jobs | medium |
| 10 | `src/app/_components/LectureProgress.tsx` | **modify.** Poll on `extracting`; call `/reconstruct`; show `n of N`; show the paused hint | low |
| 11 | `src/app/_components/LectureUpload.tsx` | **modify.** `transcribed` branch enqueues, then polls `/reconstruct` | low |
| 12 | `src/app/api/lectures/[id]/route.ts` | **modify, optional.** Include job progress in the GET payload so a page load knows where it is without a second call | low |
| 13 | `scripts/test-reconstruction.mts` | **modify.** Must pass unchanged, plus new cases for the single-window function | — |
| 14 | `scripts/verify-knowledge-pipeline.mts` | **modify.** Drive the drain loop instead of one `/extract` | low |
| 15 | `DEPLOY.md` | **modify.** Correct the stale "60 is the Hobby ceiling" line (§2.1); document `CRON_SECRET`; note that v2 has no Vercel project yet | — |

### The three risky steps

**Step 4 — extracting `runWindow` from `reconstructLecture`.** Today it is a
closure that mutates `stats` and pushes into `out`. It also carries the safety
mechanism: quotes are located with `bounds: {from: win.spokenStart, to:
win.spokenEnd}`, which is what makes "verified against the window the model
actually saw" true rather than "verified against the whole transcript". Pull
that out wrong and the guarantee silently weakens — the code still runs, the
tests still pass unless they check bounds, and coincidences start becoming
evidence. `scripts/test-reconstruction.mts` already exercises `__internals` with
an injected provider; **it must pass unmodified**, and a case must be added that
proves a quote from outside the window is still rejected. `reconstructLecture`
itself must keep working, because two verification scripts call it.

**Step 7 — rewriting the extract route.** Layer 1 must not change. The transcript
gate (validation, quarantine) must not change. The `layerOneAlreadyRun` guard
must not change. What changes is that Layer 2/3 becomes an enqueue, and
`decideReadiness` moves to the finalizer. **The failure to watch for is the
lecture stranded in `extracting`** (§7): every not-ready path in the finalizer
must set `status = 'transcribed'` explicitly. Write that test first.

**Step 8 — `vercel.json`.** `"0 3 * * *"` is the only frequency that deploys on
both plans. **Any expression that would run more than once a day fails the build
on Hobby** — it is a deployment error, not a runtime one, so getting this wrong
breaks the whole site, not just the feature. Since §2.3 could not establish the
plan, ship the daily expression and leave a comment saying it can become
`*/5 * * * *` once the account is confirmed to be Pro. Adding `vercel.json` also
means the fixture-tracing config in `next.config.ts` and any function settings
must be re-checked against it.

### Verification, in order

1. `npm run test:reconstruction` — unchanged, plus the window-bounds case.
2. `npm run test:knowledge-plan` — must be untouched and must still pass; if it
   needed changing, the chunking leaked into `plan.ts`.
3. A 50-minute fixture through the full loop, confirming: it reaches `ready`; it
   takes more than one drain call; killing the process mid-run and resuming
   re-reads only the in-flight windows.
4. Two tabs on the same lecture: exactly one does work; both show the same count.
5. A lecture whose transcript has no timeline: ends `transcribed` with the
   `nothing_to_read` reason, never `extracting`.

---

## 12. Open questions

- **The Vercel plan for classmind-v2 is unknown** (§2.3). It changes only the
  cron line, not the architecture, but it should be settled before step 8.
- **Whether v2 will deploy as a new Vercel project or replace v1's Root
  Directory.** `DEPLOY.md` currently documents v1 and will mislead whoever
  deploys v2.
- **The provider's actual rate limit** has still never been measured, so
  `CONCURRENCY = 4` remains a guess with a good reason behind it. It is the one
  lever that would meaningfully shorten the wait, and it should be measured
  before it is moved.
