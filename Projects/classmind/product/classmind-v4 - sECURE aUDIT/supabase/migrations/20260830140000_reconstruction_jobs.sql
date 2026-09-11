-- Reconstruction as a resumable job, not as a request.
--
-- WRITTEN 2026-08-30. NOT APPLIED. Apply deliberately, with the routes that
-- read these tables, not before.
--
-- WHY THIS EXISTS
--
-- Layer 2 runs on the HTTP request path. src/lib/reasoning/reconstruct.ts
-- records the measured cost of that, at CONCURRENCY 4 and ~40s a call:
--
--     23 min   12 + 8  = 20 calls   ~200s   fits
--     36 min   18 + 12 = 30 calls   ~300s   at the limit
--     50 min   25 + 17 = 42 calls   ~440s   TIMES OUT
--     90 min   45 + 30 = 75 calls   ~760s   TIMES OUT
--
-- A normal college lecture is 45-60 minutes, so the product cannot process a
-- normal lecture. The Vercel function ceiling is 300s on Hobby and 800s on Pro;
-- neither number fixes this, because the cost grows with lecture length and the
-- ceiling does not. Raising maxDuration buys one lecture length and makes the
-- failure worse: a request that dies at minute nine has written nothing, so the
-- whole pass is repeated from zero.
--
-- The unit of durable progress is therefore the WINDOW. Windows are already
-- independent by construction -- each one is a bounded excerpt, read alone,
-- with its quotes verified against itself -- so a pass over them can stop
-- anywhere and resume anywhere, and a crash costs at most the windows that were
-- in flight.
--
-- WHAT THIS DOES NOT CHANGE
--
-- storeKnowledge, planKnowledgeWrite and decideReadiness are untouched. They
-- still receive one complete proposal set for the lecture and one `complete`
-- flag, exactly as they do today. Chunking happens strictly upstream of them:
-- windows accumulate here, and the finished set is handed over in ONE call at
-- the end. That is deliberate -- `complete` is the field that distinguishes
-- "there was nothing to find" from "we never managed to look", and a design
-- that wrote knowledge window by window would have to abandon it.

-- One row per reconstruction RUN of one lecture.
create table public.reconstruction_jobs (
  id         uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,

  -- Which reasoning pass this run is. Same contract as extraction_method on
  -- extraction_candidates: a better reasoner is a new run over unchanged
  -- evidence, and the two must be distinguishable after the fact.
  reconstruction_method  text not null,
  reconstruction_version text not null,

  -- 'queued'   windows have been seeded; nothing has been read yet.
  -- 'draining' at least one window has been claimed.
  -- 'storing'  every window is terminal and the single storeKnowledge call is
  --            in flight. A separate state because that call is the one step
  --            that must happen exactly once.
  -- 'stored'   knowledge written, readiness decided. Terminal.
  -- 'failed'   the run could not proceed at all -- no windows could be seeded,
  --            or storage itself refused. Terminal.
  state text not null default 'queued'
    check (state in ('queued','draining','storing','stored','failed')),

  total_windows  integer not null default 0,
  done_windows   integer not null default 0,
  failed_windows integer not null default 0,

  -- THE JOB LEASE. Held by whichever drain call is currently working this job.
  --
  -- Without it, two open tabs on the same lecture would each drain at
  -- CONCURRENCY 4, giving the provider eight concurrent calls from a pipeline
  -- whose own comment refuses to guess the rate limit. The second tab reads
  -- progress and does no work.
  lease_expires_at timestamptz,

  -- When a window last completed. This is what tells a resumed job apart from
  -- an abandoned one, and it is what the recovery sweep orders by.
  last_progress_at timestamptz not null default now(),

  -- The reason recorded on the lecture when this run did not publish it.
  -- Written from decideReadiness, so the wording stays in one place.
  error_message  text,
  readiness_code text,

  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- IDEMPOTENT ENQUEUE. Two requests to process the same lecture with the same
-- reasoner are ONE job. Enqueue is `insert ... on conflict do nothing` followed
-- by a select, so the loser of the race gets the winner's job and reports its
-- progress rather than starting a second pass over the same transcript.
create unique index reconstruction_jobs_run_idx
  on public.reconstruction_jobs (lecture_id, reconstruction_method, reconstruction_version);

-- AT MOST ONE UNFINISHED JOB PER LECTURE, whatever the version.
--
-- The index above stops the same run being enqueued twice. This one stops a
-- DIFFERENT run -- a deliberate re-process with an upgraded reasoner -- from
-- being started while the first is still going. Two live runs would both reach
-- storeKnowledge, and the second would delete the first's machine-derived rows
-- and insert its own, which is correct behaviour applied to a lecture that was
-- never finished in the first place.
create unique index reconstruction_jobs_one_live_idx
  on public.reconstruction_jobs (lecture_id)
  where state in ('queued','draining','storing');

-- The recovery sweep's read: unfinished jobs, oldest silence first.
create index reconstruction_jobs_resumable_idx
  on public.reconstruction_jobs (last_progress_at)
  where state in ('queued','draining');

-- One row per window of one run. This is the durable progress.
create table public.reconstruction_windows (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.reconstruction_jobs(id) on delete cascade,
  -- Denormalised so a window can be traced to its lecture without a join, and
  -- so deleting a lecture takes its windows with it by either path.
  lecture_id uuid not null references public.lectures(id) on delete cascade,

  -- The two passes have different strides and different prompts, and the same
  -- start_ms belongs to both. Both are part of this window's identity.
  pass     text not null check (pass in ('actionable','teaching')),
  start_ms integer not null,
  end_ms   integer not null,

  state text not null default 'pending'
    check (state in ('pending','running','done','failed')),

  -- Incremented at CLAIM, not at completion. A window whose worker vanished has
  -- been attempted, and counting it any other way lets a window that reliably
  -- kills its worker be retried forever.
  attempts integer not null default 0,

  -- THE WINDOW LEASE. A 'running' window whose lease has expired is a window
  -- whose worker died, and it goes back in the queue. This is the whole
  -- crash-recovery mechanism: there is no separate resume path, because a
  -- crash and a slow worker are indistinguishable from outside and are treated
  -- identically.
  lease_expires_at timestamptz,

  -- The VERIFIED ReconstructedItem[] this window produced.
  --
  -- Verification -- every quote located character-for-character inside this
  -- window's own excerpt -- has already happened by the time anything is
  -- written here. What is stored is the result of the safety mechanism, not
  -- model output awaiting one. The character offsets point into the transcript,
  -- which is immutable, so they stay meaningful for as long as the row does.
  items jsonb not null default '[]'::jsonb,

  -- Why this window failed, in the provider's words. Rolled up into the job's
  -- reason so a teacher is never shown a stack of these.
  error text,

  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- WINDOW IDENTITY. Windows are derived deterministically -- windowStarts() is
-- pure and the transcript is immutable -- so re-seeding a job that crashed
-- half way through seeding produces exactly the rows that are already there.
-- Seeding is `on conflict do nothing` and is safe to repeat.
create unique index reconstruction_windows_identity_idx
  on public.reconstruction_windows (job_id, pass, start_ms);

-- The claim read and the progress count.
create index reconstruction_windows_claim_idx
  on public.reconstruction_windows (job_id, state);

-- ---------------------------------------------------------------------------
-- Claiming
-- ---------------------------------------------------------------------------
--
-- Both claims are compare-and-swap in ONE statement. They are SQL functions
-- rather than PostgREST calls for two reasons: `for update skip locked` cannot
-- be expressed through the JS client, and `now()` evaluated here is the
-- database's clock rather than a serverless function's, so a lease cannot be
-- taken early or held late because two machines disagree about the time.

-- Take the job lease, or return nothing if someone else holds it.
--
-- Returns the job on success so the caller learns the state it just moved to.
-- A caller that gets no row is a READER: it reports progress and does no work.
create or replace function public.claim_reconstruction_job(
  p_job_id        uuid,
  p_lease_seconds integer
)
returns setof public.reconstruction_jobs
language sql
volatile
as $$
  update public.reconstruction_jobs j
     set state            = 'draining',
         lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where j.id = p_job_id
     and j.state in ('queued','draining')
     and (j.lease_expires_at is null or j.lease_expires_at < now())
  returning j.*;
$$;

-- Hand out up to p_limit windows, skipping any another worker is holding.
--
-- 'pending' and expired-'running' are claimed by the same predicate on purpose:
-- a window abandoned by a dead worker is simply a window that has not been
-- read, and giving it a second name would give it a second code path.
create or replace function public.claim_reconstruction_windows(
  p_job_id        uuid,
  p_limit         integer,
  p_lease_seconds integer,
  p_max_attempts  integer
)
returns setof public.reconstruction_windows
language sql
volatile
as $$
  update public.reconstruction_windows w
     set state            = 'running',
         attempts         = w.attempts + 1,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where w.id in (
     select c.id
       from public.reconstruction_windows c
      where c.job_id = p_job_id
        and c.attempts < p_max_attempts
        and (c.state = 'pending'
             or (c.state = 'running' and c.lease_expires_at < now()))
      order by c.pass, c.start_ms
        for update skip locked
      limit p_limit
   )
  returning w.*;
$$;

-- Retire windows that have used up their attempts and are no longer held.
--
-- Called before each claim. A window that reaches here is a permanent partial
-- failure: it makes the run incomplete, which planKnowledgeWrite already knows
-- how to handle -- an incomplete pass may seed an empty lecture and may never
-- overwrite a populated one.
create or replace function public.retire_exhausted_reconstruction_windows(
  p_job_id       uuid,
  p_max_attempts integer
)
returns integer
language sql
volatile
as $$
  with retired as (
    update public.reconstruction_windows w
       set state        = 'failed',
           error        = coalesce(w.error, 'This section was attempted repeatedly and never returned a usable reading.'),
           completed_at = now()
     where w.job_id = p_job_id
       and w.state = 'running'
       and w.attempts >= p_max_attempts
       and (w.lease_expires_at is null or w.lease_expires_at < now())
    returning 1
  )
  select coalesce(count(*), 0)::integer from retired;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
--
-- Same shape as every other product table: RLS on with no policies, so the
-- service client is the only thing that can read or write these. A student
-- cannot reach a half-finished reconstruction even by guessing a URL, for the
-- same structural reason they cannot reach extraction_candidates.
alter table public.reconstruction_jobs    enable row level security;
alter table public.reconstruction_windows enable row level security;

grant select, insert, update, delete on public.reconstruction_jobs    to service_role;
grant select, insert, update, delete on public.reconstruction_windows to service_role;

grant execute on function public.claim_reconstruction_job(uuid, integer)                       to service_role;
grant execute on function public.claim_reconstruction_windows(uuid, integer, integer, integer) to service_role;
grant execute on function public.retire_exhausted_reconstruction_windows(uuid, integer)        to service_role;

comment on table public.reconstruction_jobs is
  'One reconstruction run of one lecture. Survives the request that started it; drained by POST /api/lectures/[id]/reconstruct and, as a backstop, by the scheduled sweep.';
comment on table public.reconstruction_windows is
  'Durable per-window progress. items holds the VERIFIED ReconstructedItem[] for that window; a crash costs at most the windows that were in flight.';
