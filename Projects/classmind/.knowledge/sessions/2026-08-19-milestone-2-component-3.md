---
status: Draft
created: 2026-08-21
updated: 2026-08-21
---

# Session — 2026-08-19 — Lab v0 Milestone 2, component 3: Sarvam Batch adapter and provenance

**Present:** Shyam (writing machine), Claude (engineering partner)

> **This log was written on 2026-08-21, two days after the session it describes.** The
> 2026-08-19 session ended without one. It is reconstructed from commit `b3db63b`, its message,
> and the code it introduced — all of which are unusually detailed, so the reconstruction is
> good. It is still second-hand: anything discussed and *not* committed on 2026-08-19 is lost,
> and this log cannot know what it does not contain. Treat the "What was decided" section as
> inferred from code unless it links to `../decisions.md`.

## Starting state

Milestone 2 components 1 and 2 were done (2026-08-07): the `runs` table migration, bucket
provisioning script, and `POST /api/runs`. Component 3 — the `TranscriptionProvider` interface,
the Sarvam adapter and the submit/poll routes — was recorded as "Next" in both `progress.md` and
`lab/v0-ingestion/README.md`.

Two blockers were carried in from 2026-08-07, both needing account access: no Supabase project
and no `.env.local`, so the migration had never been applied and the bucket never provisioned;
and no Sarvam API key. Both were cleared during this session (see "Ending state").

## Work done

**The provider boundary — `src/lib/transcription/types.ts`.** The file the Milestone 2 migration
comment had referenced since 2026-08-07 and which did not exist until this session. Provider job
states collapse to `in_progress | completed | failed`, so nothing downstream knows the word
"Sarvam". `provider_status` retains the raw provider string for debug and audit and is never
branched on. Swapping providers is a one-line change in `index.ts`.

**The Sarvam adapter — `src/lib/transcription/sarvam.ts`** (~220 lines). Implements the
asynchronous Batch API rather than the 30-second synchronous endpoint: `initiate` →
`upload-files` → `PUT` to the presigned URL → `start` → poll `status` → `download-files` → `GET`
the result.

One step is not covered by Sarvam's own reference: how to upload to the presigned URL.
`storage_container_type` comes back as `"Azure_V1"`, so the adapter uses the Azure Blob SAS
convention (`PUT` with `x-ms-blob-type: BlockBlob`). **This is an assumption, not documentation.**
It is deliberately isolated in `uploadToPresignedUrl()` as the single thing to change if the
first live run disproves it.

**Routes.** `POST /api/runs/[id]/transcribe` streams audio from Storage to the provider and
writes `provider_job_id` in the same statement that moves the run to `transcribing`, so a crash
can never leave an in-flight job unpollable. `POST /api/runs/[id]/poll` polls once per call
rather than looping — the row already carries everything a poll needs, which is what makes an
in-flight transcription resumable across a refresh or restart.

**Provenance — `src/lib/provenance/`.** Built and written in the same `UPDATE` as the transcript,
because Constitution IV forbids retrofitting it; there is deliberately no code path that stores a
transcript without one. `decodingParams` is built from the same `const` that builds the request
body, so the record cannot drift from what was actually sent. A dirty working tree is recorded as
`<sha>-dirty` rather than passed off as a clean commit.

**Backend provisioning, and two bugs it surfaced.** Both fixes are in the same commit:

- `scripts/setup-storage.mts` — `isNotFound()` tested `error.status === 404`, but the SDK reports
  a missing bucket as `status` 400 with `statusCode` `"404"` (a *string*). The existence probe was
  therefore misread as fatal and the bucket could never be created. Normalized to a number.
- `src/lib/storage/runs-bucket.ts` — `FILE_SIZE_LIMIT_BYTES` 500 MiB → 50 MiB. The Supabase Free
  plan caps the global file size limit at 50 MB and a per-bucket limit cannot exceed it, so
  500 MiB was rejected outright. Compressed lecture audio fits; uncompressed WAV does not, and is
  not needed for this version.

## What was decided

No entries were added to `../decisions.md` on 2026-08-19. The choices visible in the code all
follow from decisions already recorded on 2026-08-07 (the stack; Sarvam's async Batch API meaning
a run models a job; Course Context staying out of Lab v0).

Two judgements were made in code and are worth naming, because neither is obvious from the
decisions already on file:

1. **Record gaps rather than paper over them.** Two limitations are written into a `limitations`
   array on the provenance record instead of being silently omitted: Sarvam publishes only the
   floating alias `saaras:v3` and no dated snapshot, so **Constitution IV's dated-snapshot
   requirement is formally unmet and no date was invented**; and Sarvam returns no cost figure, so
   `costEstimate` is `null`.
2. **Isolate the unverified assumption.** The Azure Blob SAS upload convention is a guess from
   `storage_container_type`, confined to one function so the first live run can disprove it
   cheaply.

## Learnings captured

**None — and that is the gap this log exists to record.** No `AI-Memory/` candidate was written,
because `Skills/End-Session/` had never been run and `AI-Memory/Inbox/` did not exist. The
404-vs-400 bug in particular (an SDK reporting a status code as a string in a different field
than the one you would check, turning "not found" into "fatal") is the kind of finding the
pipeline exists to keep. It is captured belatedly in the 2026-08-21 session.

## Mistakes hit

- **The commit was never pushed.** It sat on the local `master` for two days while
  `origin/master` stayed at `98a7b7a`. Under the single-writer model (`TEAM.md` §0) that meant
  Shiv and Darsh could not see any of Milestone 2 component 3. Root cause is structural, not
  carelessness: `scripts/autosave.sh` is wired to `PostToolUse` on `Write|Edit` only, so a
  deliberate commit made through the shell — exactly the kind `CLAUDE.md` asks for at the end of
  a session — skips the auto-push entirely. **The safety net does not cover the intentional path.**
- **No `progress.md` entry, no session log, no `roadmap.md` line.** The documents continued to say
  component 3 was "Next" for two days after it was built and committed.
- **The session ended with Lab progress and no walkthrough date** — the precise failure mode named
  in `../decisions.md` (2026-08-11): *"If the next session again ends with Lab progress and no
  walkthrough date, that is this decision going wrong, and the answer is to stop building and
  book the day."* This was that next session.

## Ending state

Milestone 2's **build** is complete: a run can go from stored audio to a stored raw transcript
with provenance recorded at write time. Not built, deliberately: transcript normalization,
extraction, Course Context, embeddings, and every domain concept behind the walkthrough gate.

The Supabase project and `.env.local` now exist and a Sarvam API key was obtained, clearing both
2026-08-07 blockers. **No live Sarvam call has been made.** Milestone 2 is not verifiable end to
end until a first controlled run is made against public lecture audio.

## Next session should start with

Pushing `b3db63b` and bringing the documents up to date with the code — neither of which
happened. Then, per the project's own recorded stop condition, **booking the walkthrough day**
rather than starting Milestone 2's remaining work (transcript normalization and display).

*(Done 2026-08-21: pushed and reconciled. The walkthrough is still unbooked.)*
