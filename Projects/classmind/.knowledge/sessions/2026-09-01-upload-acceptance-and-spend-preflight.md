# 2026-09-01 — Real recordings stop being refused, and spending is asked about before anything exists

> **Reconstructed retroactively on 2026-09-01 (same day)** from the git record (Auto-save
> commits `645c884..b28165e`, 13:39–17:46 IST, plus `7f904a2` committed at capture) and the
> code's own comments. No session capture existed when this work ended. Facts below are
> verifiable in a diff; inferences are marked.

**Inbox entry:** [`AI-Memory/Inbox/classmind/2026-09-01T1216Z-upload-acceptance-and-spend-preflight/`](../../../AI-Memory/Inbox/classmind/2026-09-01T1216Z-upload-acceptance-and-spend-preflight/)
**Work in both `product/classmind-v3/` (full) and `product/classmind-v2/` (acceptance changes only).**

## Starting state

The path to uploading a real recording through the v3 web app had two obstacles that only
show up with real files and a real developer machine:

1. **The MIME whitelist refused real recordings.** Acceptance was a list of seven exact
   MIME strings, but Windows reports many perfectly real recordings — `.m4a`, `.opus`,
   `.amr` among them — as `application/octet-stream` or as no type at all. (That this was
   hit with an actual file is an inference; that the whitelist refuses such files is fact.)
2. **The money guard answered too late, and turning it off was sticky.** With spending
   disabled (the correct default), the browser only learned of the refusal from the
   transcribe route — *after* a lecture row existed and the whole recording had uploaded,
   orphaning a `pending_upload` row per attempt. And enabling a live call meant editing
   `.env.local`, which stays enabled until someone remembers to undo it.

## What was done

**1. "What counts as an audio recording" was rewritten** (`src/lib/storage.ts`, mirrored
byte-for-byte into v2): two signals, either sufficient — the browser reports an `audio/*`
type, or the filename carries the extension of a format Sarvam's batch API documents as
decodable (WAV, MP3, AAC, AIFF, OGG/Opus, FLAC, MP4/M4A, AMR, WMA, WebM, 3GP). Raw PCM is
deliberately absent: Sarvam requires an explicit `input_audio_codec` for it, which the
transcribe path does not send. The accepted file's content type is then **canonicalised
once** (`canonicalAudioContentType`) and that one value is used for the lecture row, the
storage PUT, and eventually the transcription provider — the bucket admits only `audio/*`,
so a browser that reported nothing must not put its own guess on the wire. The lectures
route refuses a file matching neither signal **before any row or signed URL exists**, and
the file input's `accept` list carries the extensions so typeless files stay pickable.

**2. `setup-storage.mts` converges instead of skipping** (both apps). The bucket-exists
branch previously printed "nothing to do", so a bucket created under the old seven-string
MIME list would keep refusing formats the code now accepts — and the refusal happens inside
the storage PUT, where it reads as a generic upload error. The script now updates an
existing bucket to the desired state (limit, `audio/*`), with the policy itself living in
`storage.ts`; the bucket wildcard is a backstop.

**3. Spending answers before anything is created** (v3 only):

- **`GET /api/transcription/authorization`** — a read-only courtesy check answering one
  question: would a live, billable transcription be permitted on this server right now? It
  reads `liveCallIsAllowedHere()` and must never influence it; the transcribe route keeps
  its own guard regardless.
- **`LectureUpload` asks first.** The pre-flight runs while there is still nothing to
  orphan; a "no" renders instructions in the idle card (what to run, what survives), not an
  error — nothing failed. Any doubt in the pre-flight (endpoint missing, network blip)
  resolves to *true* and falls through to the real guard, so the courtesy check can never
  become the protection.
- **The transcribe route's refusal carries `code: "live_transcription_disabled"`**, and the
  upload UI's error path distinguishes it: if authorization changed mid-flow, the teacher
  gets the new `authorize` failure copy — "your recording is uploaded and safe, nothing was
  charged" plus the instructions — with retry correctly *not* offered, since retrying
  without authorization refuses identically and mints another orphaned row.
- **`npm run dev:spend`** (`scripts/dev-spend.mjs`) starts the dev server with
  `ALLOW_LIVE_SARVAM=1` set for that one child process, prints a loud banner, and forgets
  the authorization when the process exits. Nothing is written to `.env.local`; the next
  plain `npm run dev` starts safe again. `.env.example` now recommends this over setting
  the variable (committed at capture as `7f904a2`).

**4. Docs.** `README.md` gained the dev:spend workflow (and its title finally says V3, not
V1); `package.json` gained the script.

## Decisions made (captured as candidates, not written into decisions.md)

- Acceptance is type-OR-extension with canonicalisation at the boundary; raw PCM excluded.
- The spend opt-in is per-process, not per-file: authorization should die with the process
  that asked for it.
- v2 received the acceptance/canonicalisation changes but **not** the spend pre-flight UX —
  v2 has no authorization route and no dev:spend. The two trees continue to diverge; the
  point at which they diverge irreconcilably is still undecided (open since 2026-08-30).

## Problems hit

The two starting-state obstacles are the problems; both are closed. A third was implied and
fixed in passing: an already-provisioned bucket silently carrying stale config (see §2).

## Unresolved questions

- Do orphaned `pending_upload` rows from earlier refused attempts exist in the live
  database, and should they be cleaned up? (Any refusal that arrived after create+upload
  left one behind.)

## Ending state

All work committed via Auto-saves plus `7f904a2`. Offline verification run at capture time
over the final tree: see the Inbox entry's `evidence.json` for the tsc/eslint results in
both apps. No paid endpoint was touched by this work or its capture.

## Next session should start with

The operator's stated plan for 2026-09-01: set up the paid Gemini reasoning key, test it
against already-stored transcripts, finalize the processing engine (the 36-minute ceiling
and the standing backend blockers, per the operator's two-day brief), then a live
end-to-end walkthrough — the operator acting as faculty, uploading a newly recorded
lecture. The design loop is deliberately not part of the day.
