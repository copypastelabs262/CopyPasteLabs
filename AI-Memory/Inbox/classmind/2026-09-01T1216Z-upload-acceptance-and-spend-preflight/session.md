---
project: classmind
session_id: 2026-09-01T1216Z-upload-acceptance-and-spend-preflight
schema_version: 1
generated_by: End-Session/1.0.0 (hand-authored retroactively, same day)
generated_at: 2026-09-01T13:40:00Z
---

# 2026-09-01 — Upload acceptance for real files, and the spend-authorization pre-flight

> **Retroactive capture, same day.** This work (Auto-saves `645c884..b28165e`, 13:39–17:46
> IST, plus `7f904a2` committed at capture) ended with no session record; reconstructed
> from git and the code's own comments. The fuller narrative is
> `Projects/classmind/.knowledge/sessions/2026-09-01-upload-acceptance-and-spend-preflight.md`.

## Starting state

Two obstacles between the operator and a real local upload: the seven-string MIME
whitelist refused recordings Windows reports as `application/octet-stream` or typeless
(`.m4a`, `.opus`, `.amr`); and the money guard's refusal arrived only from the transcribe
route — after a lecture row existed and the full recording had uploaded — while enabling
spending meant a sticky edit to `.env.local`.

## What was done

1. **Acceptance rewritten** (`src/lib/storage.ts`, mirrored into v2): audio/* type OR a
   recognised audio extension; raw PCM deliberately excluded (Sarvam needs an explicit
   `input_audio_codec` the transcribe path does not send). The content type is
   canonicalised once and used for the lecture row, the storage PUT, and the provider.
   The lectures route refuses a non-audio file before any row or signed URL exists.
2. **`setup-storage.mts` converges** (both apps): an existing bucket is updated to the
   desired limit and `audio/*` instead of being skipped — a bucket provisioned under the
   old list kept refusing formats the code now accepts, and the refusal surfaced inside
   the storage PUT as a generic upload error.
3. **Spend pre-flight** (v3 only): read-only `GET /api/transcription/authorization`
   answers "would a live transcription be permitted here right now?" before anything is
   created; the upload UI renders a "no" as instructions in the idle card, not an error.
   Doubt resolves to "allowed" so the courtesy check can never replace the transcribe
   route's own guard. The route's refusal now carries
   `code: "live_transcription_disabled"`, which the UI distinguishes from real failures
   (new `authorize` failure copy: recording uploaded and safe, nothing charged, retry not
   offered).
4. **`npm run dev:spend`** (`scripts/dev-spend.mjs`): starts the dev server with
   `ALLOW_LIVE_SARVAM=1` for that one process, banner printed, nothing written to any
   file; authorization dies with the process. README documents the workflow;
   `.env.example` recommends it (committed at capture as `7f904a2`).

## Decisions made

- Acceptance is type-OR-extension with canonicalisation at the boundary; PCM excluded.
- The spend opt-in is per-process, never per-file.
- v2 received the acceptance changes only — no authorization route, no dev:spend there.

## Problems hit

The starting-state obstacles, plus the stale-bucket drift in item 2.

## Unresolved questions

- Do orphaned `pending_upload` rows from earlier refused attempts exist in the live
  database, and should they be cleaned up?

## Ending state

All committed (Auto-saves + `7f904a2`). tsc and eslint pass in both v2 and v3 at capture.
No paid endpoint touched by the work or the capture.

## Next session should start with

The operator's day plan: set up the paid Gemini reasoning key, test on stored transcripts,
finalize the processing engine (36-minute ceiling and standing backend blockers, per the
two-day brief), then a live faculty walkthrough uploading a newly recorded lecture.
