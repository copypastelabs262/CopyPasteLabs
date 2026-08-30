-- ClassMind V1 — Product Platform core schema.
--
-- Separate from Lab v0's `runs` table, which stays untouched as the research
-- environment. Nothing here reads or writes `runs`.
--
-- Access model: RLS is enabled with ZERO policies on every table, exactly as
-- `runs` does. The anon key can therefore read nothing directly; every read and
-- write goes through a server route holding the service-role key, which decides
-- what the signed-in user may see. This makes "no unverified information reaches
-- students" structural rather than a rule someone has to remember: a student's
-- browser has no path to extraction_candidates at all.

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'faculty' check (role in ('faculty','student')),
  created_at  timestamptz not null default now()
);

create table public.courses (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code     text not null,
  title    text not null,
  term     text,
  -- Lab v0, 2026-08-21: language_code 'unknown' with mode 'translit' and a
  -- language_probability of 0.617 made Sarvam return romanized ARABIC for an
  -- English/Hinglish lecture. Silent and confidence-dependent. Faculty pick the
  -- language per course instead of letting auto-detect guess.
  transcription_language text not null default 'en-IN'
    check (transcription_language in ('en-IN','hi-IN','unknown')),
  join_code  text not null unique default encode(gen_random_bytes(4),'hex'),
  created_at timestamptz not null default now()
);
create index on public.courses (owner_id);

create table public.enrollments (
  course_id  uuid not null references public.courses(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'student' check (role in ('student','faculty')),
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);
create index on public.enrollments (user_id);

-- Course Context influences EXTRACTION only. Nothing in the transcription path
-- reads this table -- keeping the transcript free of course-specific priors is
-- what stops context from contaminating the evidence layer.
create table public.course_context (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  kind       text not null check (kind in ('syllabus','policy','schedule','note')),
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index on public.course_context (course_id);

create table public.lectures (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references public.courses(id) on delete cascade,
  title             text not null,
  status            text not null default 'pending_upload'
                      check (status in ('pending_upload','uploaded','transcribing',
                                        'transcribed','extracting','ready','failed')),
  original_filename text not null,
  storage_path      text not null,
  file_size_bytes   bigint not null,
  content_type      text not null,
  checksum_sha256   text,
  provider_job_id   text unique,
  provider_status   text,
  -- The immutable artefact. Everything readable is re-derived from this at read
  -- time; it is never edited and never deleted.
  raw_transcription_response jsonb,
  provenance        jsonb,
  error_message     text,
  recorded_on       date,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create index on public.lectures (course_id, created_at desc);

-- IMMUTABLE proposals. Rows here are never updated and never deleted.
-- Capture Contract Article 5: the proposal and the verdict are two distinct
-- records, and approval never overwrites what the machine actually said.
create table public.extraction_candidates (
  id          uuid primary key default gen_random_uuid(),
  lecture_id  uuid not null references public.lectures(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  kind        text not null check (kind in ('assignment','deadline','exam_scope',
                                            'announcement','guidance')),
  title       text not null,
  detail      text not null,
  -- Capture Contract Article 4: what was actually said is stored alongside
  -- anything resolved from it, never instead of it.
  due_phrase  text,
  due_resolved date,
  -- Article 7: time in the audio is the durable anchor. Character offsets into
  -- the transcript are kept for convenience and die on re-transcription.
  evidence_start_ms   integer not null,
  evidence_end_ms     integer not null,
  evidence_char_start integer,
  evidence_char_end   integer,
  evidence_text       text not null,
  confidence   numeric,
  matched_cue  text,
  -- Which method produced this, so pattern-matching / NER / LLM can be compared
  -- later on identical input.
  extraction_method  text not null,
  extraction_version text not null,
  created_at   timestamptz not null default now()
);
create index on public.extraction_candidates (lecture_id);
create index on public.extraction_candidates (course_id);

-- Append-only verdicts. A reject is retained, not deleted -- the denials are the
-- most informative examples the system produces.
create table public.candidate_reviews (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.extraction_candidates(id) on delete cascade,
  actor_id     uuid not null references auth.users(id),
  action       text not null check (action in ('confirm','edit','reject')),
  final_kind        text,
  final_title       text,
  final_detail      text,
  final_due_phrase  text,
  final_due_resolved date,
  note         text,
  created_at   timestamptz not null default now()
);
create index on public.candidate_reviews (candidate_id, created_at desc);

alter table public.profiles              enable row level security;
alter table public.courses               enable row level security;
alter table public.enrollments           enable row level security;
alter table public.course_context        enable row level security;
alter table public.lectures              enable row level security;
alter table public.extraction_candidates enable row level security;
alter table public.candidate_reviews     enable row level security;

grant select, insert, update, delete on public.profiles              to service_role;
grant select, insert, update, delete on public.courses               to service_role;
grant select, insert, update, delete on public.enrollments           to service_role;
grant select, insert, update, delete on public.course_context        to service_role;
grant select, insert, update, delete on public.lectures              to service_role;
grant select, insert, update, delete on public.extraction_candidates to service_role;
grant select, insert, update, delete on public.candidate_reviews     to service_role;

-- Applied 2026-08-22 as migration classmind_v1_lecture_language_code.
-- The language actually SENT to the provider, persisted at submit time, because
-- provenance is written later (at poll) and must reproduce this call's params.
alter table public.lectures add column language_code text;
