-- The processing ledger: what every reasoning run cost, and what may be reused.
--
-- WRITTEN 2026-08-30. NOT APPLIED. Apply deliberately.
-- Until it is applied the code degrades: no reuse, no recording, and the
-- extract response says so in `ledger: "unavailable"` rather than pretending.
--
-- WHY THIS EXISTS
--
-- On 2026-08-30 the Sarvam balance went from freshly topped up to
-- `402 insufficient_quota_error` inside one working day, with no lecture
-- uploaded by the operator. Nothing in the product could say where it went,
-- because nothing counted. Two separate defects produced that:
--
--   1. Layer 1 had an idempotency guard and Layer 2 -- the PAID layer -- did
--      not. `extraction_candidates` was checked for "has this method+version
--      already read this lecture"; reconstruction was re-run unconditionally.
--      At temperature 0 a re-run produces byte-identical output at full price,
--      and dev.log shows exactly that: the same lecture reconstructed twice,
--      63s then 62s.
--
--   2. The provider already returns prompt_tokens and completion_tokens on
--      every response. runWindow discarded them. `stats.calls` was counted,
--      returned in the API response, and stored nowhere. There has never been
--      a way to answer "what did that run cost".
--
-- The guard and the meter belong in the same table because they are the same
-- fact: a run that completed successfully over an unchanged transcript with an
-- unchanged reasoner is a run whose result is still valid, and the row that
-- proves it is the row that recorded what it cost.

create table public.processing_runs (
  id         uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,

  -- ---- THE CACHE KEY ----------------------------------------------------
  --
  -- All six together. Any difference is a different question and must be paid
  -- for; no subset is sufficient, and that is the whole point:
  --
  --   transcript_sha256  the INPUT. Not the lecture id -- a re-transcription
  --                      produces a new transcript for the same lecture, and
  --                      reusing the old reading of it would be wrong. Hashed
  --                      over the normalized transcript text, which is derived
  --                      deterministically from the immutable raw response.
  --   method + version   the reasoner. A better pass over unchanged evidence
  --                      is a new run, exactly as extraction_method is on
  --                      extraction_candidates.
  --   provider + model   who answered. Two providers are two different
  --                      readings of the same lecture and both are worth
  --                      having; reusing one for the other would silently
  --                      destroy the cross-provider comparison the evaluation
  --                      harness is going to be built on.
  transcript_sha256      text not null,
  reconstruction_method  text not null,
  reconstruction_version text not null,
  provider               text not null,
  model                  text not null,

  -- ---- OUTCOME ----------------------------------------------------------
  --
  -- 'succeeded'  every window returned; the result is complete and reusable.
  -- 'partial'    at least one window failed. NOT reusable: an incomplete pass
  --              has seen only part of the lecture, so its silence about the
  --              rest means nothing, and caching that silence would make a
  --              transient provider failure permanent.
  -- 'failed'     the pass could not run at all.
  -- 'reused'     no model was called; a prior run's knowledge was served.
  outcome text not null
    check (outcome in ('succeeded','partial','failed','reused')),

  -- Mirrors ReconstructionResult.complete. Only a row that is both
  -- outcome='succeeded' AND complete may be reused.
  complete boolean not null default false,

  -- ---- THE METER --------------------------------------------------------
  --
  -- Null rather than 0 where the provider did not report usage: a provider
  -- that returns no token counts is a fact worth keeping, and recording it as
  -- zero would understate every total computed from this table.
  calls             integer not null default 0,
  prompt_tokens     integer,
  completion_tokens integer,
  duration_ms       integer not null default 0,

  windows                    integer not null default 0,
  failed_windows             integer not null default 0,
  items_proposed             integer,
  items_dropped_unverifiable integer,
  -- Knowledge attached to the lecture after this run, reused runs included.
  knowledge_total            integer,

  -- Set when this run was forced past a reusable result with ?force=1. That is
  -- a deliberate experiment and must be distinguishable after the fact from a
  -- run that had no choice.
  forced boolean not null default false,

  error      text,
  created_at timestamptz not null default now()
);

-- THE REUSE READ. Narrow partial index: only rows that are actually reusable
-- are in it, so the lookup cannot accidentally match a partial or failed run.
create index processing_runs_reusable_idx
  on public.processing_runs (
    lecture_id, transcript_sha256, reconstruction_method,
    reconstruction_version, provider, model, created_at desc
  )
  where outcome = 'succeeded' and complete;

-- The cost read: what did this lecture cost, across every run of it.
create index processing_runs_lecture_idx on public.processing_runs (lecture_id, created_at desc);
-- The bill read: what did everything cost, by provider, over a period.
create index processing_runs_spend_idx on public.processing_runs (provider, created_at desc);

-- Same shape as every other product table: RLS on with no policies, so the
-- service client is the only thing that can read or write it. Cost data is
-- operator data; a student and a teacher have no business reading it.
alter table public.processing_runs enable row level security;
grant select, insert, update, delete on public.processing_runs to service_role;

comment on table public.processing_runs is
  'One row per reasoning run of one lecture, reused runs included. Doubles as the idempotency ledger (the six cache-key columns) and the cost meter (calls, tokens, duration).';
