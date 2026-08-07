-- Lab v0, Milestone 2 (Audio Ingestion). One row per attempt at processing
-- one audio file: upload -> Sarvam transcription -> normalized transcript.
--
-- Deliberately has no relationship to any course/session/lecture concept.
-- Course Context is out of scope for Lab v0 (2026-08-07 decision) and the
-- eventual link -- if one is ever added -- is a single additive nullable
-- foreign key, cheapest kind of migration there is. Do not add one
-- speculatively: the real domain model links Course Offering -> Session ->
-- Recording, not directly to a transcription run, and which table a future
-- FK should target is exactly what the walkthrough (not this schema) is
-- meant to settle. See .knowledge/domain-model.md and lab/README.md's gate
-- line ("anything that handles bytes and provenance is not behind the gate").
create table public.runs (
  id                          uuid primary key default gen_random_uuid(),
  created_at                  timestamptz not null default now(),
  completed_at                timestamptz,
  status                      text not null default 'pending_upload'
                               check (status in
                                 ('pending_upload', 'uploaded', 'transcribing', 'completed', 'failed')),
  original_filename           text not null,
  storage_path                text not null,
  file_size_bytes             bigint not null,
  content_type                text not null,
  checksum_sha256             text,
  error_message                text,
  raw_transcription_response  jsonb,
  transcript_normalized       jsonb,
  provenance                  jsonb
);

comment on table public.runs is
  'Lab v0 Experiment Platform. One row per audio-to-transcript processing attempt. No FK to any course/session concept -- see file header.';

-- Only the service-role client (server-side) ever touches this table.
-- RLS enabled with zero policies is a deliberate deny-by-default: the anon
-- key is never used for reads or writes against `runs` in this milestone.
alter table public.runs enable row level security;
