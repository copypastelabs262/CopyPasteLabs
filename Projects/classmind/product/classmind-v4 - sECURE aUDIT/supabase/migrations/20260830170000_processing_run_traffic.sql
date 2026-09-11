-- What actually went over the wire, as opposed to what was attempted.
--
-- WRITTEN 2026-08-30. Apply deliberately. Until it is applied the code falls
-- back to writing the original columns only and says so in the extract
-- response's ledgerNote -- the ledger keeps working, it just records less.
--
-- WHY
--
-- Test A recorded `calls: 20` for a run that made roughly SIXTY requests,
-- completed none of them and spent zero tokens. Every one of those numbers is
-- true of a different thing, and the row said only the first:
--
--   calls            LOGICAL WINDOWS. The unit of work the engine decided on.
--   http_attempts    REQUESTS. What the provider's rate limit actually counts.
--   successful_calls COMPLETIONS. What produced knowledge and burned tokens.
--   retries          attempts beyond the first.
--   rate_limited     429s. The number that explains the other four.
--
-- Reporting only `calls` made a total rate-limit failure look like twenty
-- ordinary calls. A cost meter that cannot distinguish "we asked twenty times"
-- from "we asked sixty times and were refused" is not measuring cost.
--
-- The execution settings are recorded alongside because they are what a later
-- reader will want to change, and a run that failed at 4-concurrent/10-RPM is
-- only interpretable if the row says it ran at 4-concurrent/10-RPM.

alter table public.processing_runs
  add column if not exists http_attempts       integer,
  add column if not exists successful_calls    integer,
  add column if not exists retries             integer,
  add column if not exists rate_limited        integer,
  add column if not exists requests_per_minute integer,
  add column if not exists concurrency         integer;

-- Nullable on purpose. Rows written before this migration genuinely do not know
-- these numbers, and backfilling them with zeros would assert something false
-- about the run that exposed the need for them.

comment on column public.processing_runs.calls is
  'LOGICAL WINDOWS attempted. Not provider traffic -- see http_attempts.';
comment on column public.processing_runs.http_attempts is
  'Actual HTTP requests, retries included. This is what a provider rate limit counts.';
comment on column public.processing_runs.successful_calls is
  'Requests that returned a usable completion. Only these produce tokens and knowledge.';
comment on column public.processing_runs.rate_limited is
  '429 responses. A high value against a low successful_calls means the run was throttled, not broken.';

-- The throttling read: which runs were rate-limited, worst first.
create index if not exists processing_runs_rate_limited_idx
  on public.processing_runs (created_at desc)
  where rate_limited > 0;
