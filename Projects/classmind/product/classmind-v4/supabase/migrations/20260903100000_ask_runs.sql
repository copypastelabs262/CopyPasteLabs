-- The ask meter: what every student question cost, including the ones that
-- cost nothing.
--
-- WRITTEN 2026-09-03. NOT APPLIED. Apply deliberately.
-- Until it is applied the code degrades: every ask still prints one meter line
-- to the server log, and the API response says `meter: "unavailable"` rather
-- than pretending the row was written.
--
-- WHY THIS EXISTS
--
-- Ask was the product's second paid path and the unmeasured one. Every
-- completion returned prompt_tokens and completion_tokens; the route discarded
-- them -- the same defect that emptied the Sarvam balance on 2026-08-30, alive
-- on a different endpoint. Roadmap item R6 (run-77408ea3 inspection report).
--
-- Unlike processing_runs this table is a METER ONLY, not an idempotency guard:
-- two identical questions asked a day apart may deserve different answers
-- (knowledge changes under them), so nothing here is a cache key and nothing
-- is ever reused from it.

create table public.ask_runs (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  -- Null = course-wide scope; set = the ask was scoped to one lecture.
  lecture_id uuid references public.lectures(id) on delete cascade,
  -- Who asked. Kept for "who is spending" queries; no FK into auth schema, by
  -- the same convention as every other product table.
  user_id    uuid not null,

  -- Truncated to 500 chars by the writer. The meter is not a transcript store.
  question   text not null,

  -- How the answer was produced. THE column this table exists for:
  --   'model'         one billed reasoning call composed the prose
  --   'direct'        answered from stored fields; NO call was made
  --   'degraded'      a model was wanted but unavailable/failing; notes listed
  --   'no_knowledge'  retrieval found nothing to answer from
  -- The bill is `sum(tokens) where route = 'model'`; everything else is the
  -- proof of what the routing saved.
  route text not null
    check (route in ('model','direct','degraded','no_knowledge')),

  -- Set only on 'model' rows. Null elsewhere, and null rather than 0 when the
  -- provider reported no usage -- an unknown recorded as zero understates
  -- every total computed from this table.
  provider          text,
  model             text,
  request_id        text,
  prompt_tokens     integer,
  completion_tokens integer,

  units_available integer not null default 0,
  units_cited     integer not null default 0,
  duration_ms     integer not null default 0,

  -- The model failure that forced a 'degraded' row, when there was one.
  error      text,
  created_at timestamptz not null default now()
);

-- The bill read: model-call spend over a period.
create index ask_runs_spend_idx on public.ask_runs (route, created_at desc);
-- The course read: what is being asked of one class, newest first.
create index ask_runs_course_idx on public.ask_runs (course_id, created_at desc);

-- Same shape as every other product table: RLS on with no policies, so the
-- service client is the only reader and writer. Cost data is operator data.
alter table public.ask_runs enable row level security;
grant select, insert, update, delete on public.ask_runs to service_role;

comment on table public.ask_runs is
  'One row per Ask question, $0 routes included. The cost meter for the answering path: route says whether a model was called, prompt/completion_tokens say what it cost.';
