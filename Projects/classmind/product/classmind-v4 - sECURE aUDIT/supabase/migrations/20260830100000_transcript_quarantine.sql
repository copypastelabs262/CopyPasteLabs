-- Transcript validation and quarantine.
--
-- On 2026-08-22 a live Sarvam call returned fluent romanized Arabic for an
-- English lecture, reported the language as en-IN, and the product stored it as
-- 'transcribed'. Extraction then ran and produced 21 candidates from a lecture
-- nobody had given. Nothing in the schema could express "this transcript is
-- stored, and it is not trustworthy" -- the only terminal states were success
-- and provider failure, and the provider had not failed.
--
-- 'quarantined' is that missing state. It is deliberately NOT 'failed':
--   - 'failed' means the provider could not produce a transcript. Nothing to keep.
--   - 'quarantined' means a transcript EXISTS and is retained as evidence, but
--     is not fit to derive knowledge from.
--
-- The raw response is never deleted on quarantine. It is the artefact
-- everything is re-derivable from, and it is also the only proof of what the
-- engine actually did -- which is precisely what was needed to diagnose this.

alter table public.lectures drop constraint if exists lectures_status_check;

alter table public.lectures
  add constraint lectures_status_check
  check (status in ('pending_upload','uploaded','transcribing',
                    'transcribed','extracting','ready','failed','quarantined'));

-- The verdict, its machine-readable code, its human-readable reason, and the
-- measurements behind it. Stored rather than recomputed so that a lecture
-- quarantined under one version of the guard STAYS quarantined: re-deriving the
-- verdict on read would silently release rows whenever a threshold moved.
alter table public.lectures
  add column if not exists transcript_validation jsonb;

comment on column public.lectures.transcript_validation is
  'Verdict from src/lib/provenance/transcript-validation.ts, written in the same statement as the transcript it describes. Null only for rows transcribed before the guard existed; those are validated on the spot when extraction is attempted.';

-- Finding quarantined lectures must be cheap: it is the queue a human has to
-- work through, and it is the number that says whether the engine is misbehaving.
create index if not exists lectures_quarantined_idx
  on public.lectures (course_id, created_at desc)
  where status = 'quarantined';
