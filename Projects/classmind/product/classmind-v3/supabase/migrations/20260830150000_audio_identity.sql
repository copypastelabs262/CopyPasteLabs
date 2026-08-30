-- Audio identity: proving a transcript belongs to THIS recording.
--
-- WRITTEN BUT NOT APPLIED. Nothing in this file has been run against any
-- database. Apply it deliberately, after reading
-- Projects/classmind/.knowledge/design/transcript-identity.md.
--
-- THE FAILURE THIS ANSWERS
--
-- 20260830100000 added a guard that asks "is this transcript linguistically
-- valid?". It cannot ask "is this transcript MINE?", and those are different
-- questions with different answers. On 2026-08-22 lecture
-- 5ced44b6-e156-4ddb-9146-14035d366620, uploaded as "Cloud computing.mp3",
-- was stored byte-correct (sha256 e4ebbb6b77...) and then served the
-- transcript of an engineering THERMODYNAMICS course outline captured from a
-- Lab v0 run the previous day. That transcript is fluent, confident English.
-- Every language check passes it. It is still `ready` today and is retained as
-- evidence by explicit instruction; nothing in this migration modifies it.
--
-- WHAT MAKES THE QUESTION ANSWERABLE
--
-- Two facts that the product already has access to and currently discards:
--
--   1. The bytes we actually handed to the provider. `checksum_sha256` is
--      computed in the BROWSER and stored unverified -- it is a claim, not a
--      proof, and 42 of the 50 rows in production do not even carry the claim
--      because only the browser upload path sends it. Hashing the object
--      server-side, at the moment it is streamed to the provider, turns the
--      claim into an observation.
--
--   2. The provider's own identity for the audio it decoded. Sarvam returns
--      `audio_hash` on every batch response -- verified on all five real jobs
--      in production. It is NOT a hash of the bytes we uploaded (it is taken
--      over their decoded audio; the response reports audio_mime "audio/wav"
--      for a file sent as mp3), so it can never prove "this transcript is of
--      my audio". It is a reliable DISCRIMINATOR: three captured fixtures have
--      three distinct values, and the seven production rows that carry both
--      values agree except where contamination occurred.
--
-- Neither fact is specific to a filename, a course, a language, a lecturer or
-- a subject. Every future lecture produces both automatically.

-- ---------------------------------------------------------------------------
-- 1. What the server observed
-- ---------------------------------------------------------------------------

-- The SHA-256 of the exact buffer handed to provider.submit(). Written in the
-- same statement as provider_job_id, so a row can never name a job without
-- naming the bytes that job was given.
--
-- This is deliberately ONE column and not two ("stored" and "submitted"). The
-- transcribe route downloads the object into one ArrayBuffer and passes that
-- same buffer to the provider, so the two digests are equal by construction
-- and a second column would only be able to disagree through a bug. If that
-- route is ever changed to stream from storage to the provider without
-- buffering, the two stop being the same thing and this column must split.
alter table public.lectures
  add column if not exists submitted_audio_sha256 text;

comment on column public.lectures.submitted_audio_sha256 is
  'SHA-256, computed server-side, of the bytes actually sent to the transcription provider. Compare against checksum_sha256 (the browser''s unverified claim). Null for every row transcribed before this migration.';

-- When those bytes were handed over. `created_at` is row creation, which
-- happens before the upload and can be hours earlier; it cannot be used to
-- decide whether a provider result predates our request.
alter table public.lectures
  add column if not exists submitted_at timestamptz;

comment on column public.lectures.submitted_at is
  'Moment the audio was handed to the provider. Anchors the freshness check: a provider job whose own created_at precedes this could not be a transcript of this submission.';

-- ---------------------------------------------------------------------------
-- 2. What the provider claimed
-- ---------------------------------------------------------------------------

-- The provider's identity for the audio it decoded, extracted through the
-- provider adapter rather than by reading a Sarvam-shaped field here. Nullable
-- because not every provider returns one and not every response carries one --
-- the cloud-computing-hinglish fixture has none, and so do 13 of the 50
-- production rows.
alter table public.lectures
  add column if not exists provider_audio_id text;

comment on column public.lectures.provider_audio_id is
  'Provider-reported identity of the decoded audio (Sarvam: raw_transcription_response->>audio_hash), lifted out of the raw response by the provider adapter at poll time. Not a hash of our bytes and never treated as one; it is a discriminator, not a proof.';

-- The verdict. Same four fields, same vocabulary and the same reason for
-- storing rather than recomputing as transcript_validation in 20260830100000:
-- a lecture quarantined under one version of the rule STAYS quarantined, and
-- re-deriving on read would silently release rows whenever the rule moved.
alter table public.lectures
  add column if not exists audio_identity jsonb;

comment on column public.lectures.audio_identity is
  'Verdict from src/lib/provenance/audio-identity.ts: { verdict: pass|uncertain|reject, code, reason, metrics }. Deliberately the same shape as transcript_validation so both can be read by one helper. Written at submit and rewritten at poll, always in the same statement as the artefact it describes.';

-- WHILE THIS MIGRATION IS UNAPPLIED. The pipeline keeps working and says so
-- rather than going quiet: every column below is written through a fallback
-- that, on a missing-column error, writes the transcript, its provenance and
-- its language verdict anyway and reports `identityStored: false` to the
-- caller. The verdict itself degrades to
--   { verdict: 'uncertain', code: 'identity_check_unavailable' }
-- which is a code the design did not name and which exists for exactly this
-- window. It is NOT `pass`: a guard that could not run must never be recorded
-- as a guard that found nothing wrong. Once this file is applied, that code
-- stops being produced.
--
-- metrics.ledgerAvailable and metrics.storageAvailable on each stored verdict
-- record which of the two facts was reachable when it was written, so a reader
-- a year from now can tell "checked and clean" from "could not check" without
-- inferring it from the migration timeline.

-- ---------------------------------------------------------------------------
-- 3. Replay, made visible in the row
-- ---------------------------------------------------------------------------

-- Replay used to be selected by an environment variable and the fixture used
-- to be chosen BY FILENAME, which is what made the 2026-08-22 failure look
-- plausible: a lecture named "Cloud computing.mp3" quietly matched a fixture
-- and was served its transcript. Both mechanisms are removed in the
-- application code. This column is the database's half of that: replay becomes
-- a per-lecture, explicitly named, queryable fact instead of an ambient
-- setting that may have changed since.
--
-- "Does production hold any replayed lecture?" is now
--   select count(*) from lectures where replay_fixture_slug is not null;
-- rather than a JSON search through provenance.limitations for the word REPLAY.
alter table public.lectures
  add column if not exists replay_fixture_slug text;

comment on column public.lectures.replay_fixture_slug is
  'Non-null only for a lecture whose transcript is a deliberate, explicitly named replay of a captured fixture. The API refuses to set it on a deployment. Never inferred from a filename, a hash or an environment variable.';

-- ---------------------------------------------------------------------------
-- 4. THE UNIQUENESS INVARIANT
-- ---------------------------------------------------------------------------
--
-- The rule: A PROVIDER AUDIO IDENTITY BELONGS TO EXACTLY ONE PIECE OF AUDIO.
-- Two lectures whose submitted bytes differ may not both be told their
-- transcript came from the same decoded audio.
--
-- WHY THE OBVIOUS FORM IS WRONG, TWICE OVER.
--
--   alter table public.lectures
--     add constraint lectures_provider_audio_id_key unique (provider_audio_id);
--
-- (a) It is semantically wrong. Re-transcribing the same lecture, or two
--     faculty uploading the same recording, legitimately produces two rows
--     with the SAME provider audio identity. Production already contains such
--     pairs -- fc0103fc / 16566f94 and f8d1b370 / 42e43afb are the same two
--     clips transcribed twice, with matching checksums and matching audio
--     hashes. A unique constraint would forbid re-transcription.
--
-- (b) It would fail to apply. Sixteen existing rows share audio_hash
--     2cb46c01b28a8d4664ef51db8536e02d. Historical rows must not be modified,
--     so there is no legal way to make that constraint valid.
--
-- Scoping the index by date -- `where created_at > '2026-08-30'` -- would let
-- it apply, but it is special-casing the calendar: the constraint would still
-- have the wrong semantics, and its correctness would depend on a literal that
-- means nothing to anyone reading it in a year.
--
-- THE CORRECT FORM is a functional dependency, not a uniqueness constraint:
-- provider_audio_id -> submitted_audio_sha256. Postgres cannot express that
-- across rows of `lectures`, but it expresses it perfectly as a primary key on
-- a separate ledger. The ledger starts EMPTY, so no historical row can make it
-- fail to apply, and no historical row is touched to create it.

create table if not exists public.provider_audio_identities (
  -- One row per identity the provider has ever handed us. The primary key is
  -- what enforces the invariant, atomically: two concurrent polls cannot both
  -- claim the same identity, which a read-then-write check in the route could
  -- never guarantee.
  provider_audio_id      text primary key,

  -- The one audio this identity is allowed to correspond to. A later result
  -- carrying this identity for different bytes is cross-contamination.
  submitted_audio_sha256 text not null,

  -- Which lecture bound it, for the audit trail. ON DELETE SET NULL rather
  -- than CASCADE: deleting a lecture must not silently free its identity for
  -- a different recording to claim. The ledger is append-only evidence.
  first_lecture_id       uuid references public.lectures(id) on delete set null,
  first_seen_at          timestamptz not null default now(),

  -- True for a binding reconstructed from historical rows below, false for one
  -- written by the live pipeline. Backfilled bindings rest on data collected
  -- under the regime that failed, so they are distinguishable and an operator
  -- may delete them without touching a single lecture.
  backfilled             boolean not null default false
);

comment on table public.provider_audio_identities is
  'Ledger enforcing: a provider audio identity belongs to exactly one piece of audio. The primary key IS the invariant. Populated by the poll route via INSERT ... ON CONFLICT DO NOTHING RETURNING; an empty RETURNING means the identity was already bound, and the caller compares digests and quarantines on a mismatch.';

create index if not exists provider_audio_identities_lecture_idx
  on public.provider_audio_identities (first_lecture_id);

-- Same access model as every other table here: RLS on, zero policies, only the
-- service role can reach it, so the anon key has no path to it at all.
alter table public.provider_audio_identities enable row level security;
grant select, insert, update, delete on public.provider_audio_identities to service_role;

-- Finding the new columns cheaply. The identity lookup at poll time is a point
-- read on the ledger's primary key, so these exist for the audit queries and
-- the conflict view rather than for the hot path.
create index if not exists lectures_provider_audio_id_idx
  on public.lectures (provider_audio_id)
  where provider_audio_id is not null;

create index if not exists lectures_submitted_audio_sha256_idx
  on public.lectures (submitted_audio_sha256)
  where submitted_audio_sha256 is not null;

-- The queue a human has to work through, alongside the language-quarantine
-- index from 20260830100000.
create index if not exists lectures_identity_rejected_idx
  on public.lectures (course_id, created_at desc)
  where audio_identity ->> 'verdict' = 'reject';

-- ---------------------------------------------------------------------------
-- 5. Seeding the ledger from history, WITHOUT MODIFYING HISTORY
-- ---------------------------------------------------------------------------
--
-- Only rows that carry BOTH facts can contribute a binding. In production that
-- is 7 rows of 50; the other 43 have no server-verifiable digest and would
-- only seed the ledger with nulls.
--
-- DISTINCT ON picks exactly one row per identity, deterministically, oldest
-- first -- so the insert cannot conflict with itself and the earliest claimant
-- wins. ON CONFLICT DO NOTHING is belt and braces for a re-run. Rows that lose
-- are NOT deleted, NOT updated and NOT flagged; they surface in the view
-- below, which is the only thing this migration does about them.
--
-- This is the one place in the schema that reads the Sarvam response shape.
-- It is a one-time read of rows that ARE Sarvam rows. From here on the value
-- arrives in lectures.provider_audio_id via the provider adapter, and no SQL
-- ever digs into the response again.
insert into public.provider_audio_identities
  (provider_audio_id, submitted_audio_sha256, first_lecture_id, first_seen_at, backfilled)
select distinct on (l.raw_transcription_response ->> 'audio_hash')
       l.raw_transcription_response ->> 'audio_hash',
       l.checksum_sha256,
       l.id,
       l.created_at,
       true
  from public.lectures l
 where l.raw_transcription_response ->> 'audio_hash' is not null
   and l.checksum_sha256 is not null
 order by (l.raw_transcription_response ->> 'audio_hash'), l.created_at
on conflict (provider_audio_id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. The legacy violations, named rather than fixed
-- ---------------------------------------------------------------------------
--
-- Read-only. Historical rows are evidence and are not modified, so the only
-- honest thing to do with a row that would violate the invariant is to be able
-- to list it.
--
-- COALESCE is what lets this cover rows written before the new columns
-- existed: for a legacy row the identity is read out of the raw response and
-- the digest is the browser's unverified claim. For a new row both come from
-- the columns. Nothing is written back.
--
-- security_invoker so the view cannot become a hole around the zero-policy RLS
-- on `lectures`; select is granted to service_role only, like every table here.
create or replace view public.lecture_identity_conflicts
with (security_invoker = true) as
with identified as (
  select l.id,
         l.course_id,
         l.title,
         l.original_filename,
         l.status,
         l.created_at,
         l.provider_job_id,
         coalesce(l.provider_audio_id,
                  l.raw_transcription_response ->> 'audio_hash') as provider_audio_id,
         coalesce(l.submitted_audio_sha256, l.checksum_sha256)   as audio_sha256
    from public.lectures l
)
select i.id,
       i.course_id,
       i.title,
       i.original_filename,
       i.status,
       i.created_at,
       i.provider_job_id,
       i.provider_audio_id,
       i.audio_sha256,
       -- How many distinct recordings claim this one provider identity. Two or
       -- more is the violation.
       (select count(distinct j.audio_sha256)
          from identified j
         where j.provider_audio_id = i.provider_audio_id
           and j.audio_sha256 is not null) as distinct_audio_claiming_identity
  from identified i
 where i.provider_audio_id is not null
   and i.audio_sha256 is not null
   and exists (
         select 1
           from identified j
          where j.provider_audio_id = i.provider_audio_id
            and j.audio_sha256 is not null
            and j.audio_sha256 <> i.audio_sha256
       );

comment on view public.lecture_identity_conflicts is
  'Historical rows that would violate the audio-identity invariant. Read-only and intentionally so: these rows are evidence of the 2026-08-22 contamination and are retained unmodified. Expect lecture 5ced44b6 here.';

grant select on public.lecture_identity_conflicts to service_role;

-- ---------------------------------------------------------------------------
-- 7. What this migration deliberately does NOT do
-- ---------------------------------------------------------------------------
--
-- It does not backfill lectures.provider_audio_id or lectures.audio_identity
-- for historical rows. Both would be UPDATEs against rows that are being
-- retained as evidence. Every read path that needs the legacy value derives it
-- the way the view above does.
--
-- It does not add 'identity_quarantined' to the status vocabulary. There is
-- already a state meaning "a transcript exists, is kept, and is not fit to
-- derive from", and that is 'quarantined'. A second word for the same state
-- would double every downstream filter and eventually one of them would be
-- missed.
--
-- It does not make checksum_sha256 NOT NULL. 42 existing rows are null and
-- cannot be filled in. The requirement is enforced at the API instead, where
-- it applies to new uploads only.
