---
status: In progress — Milestone 2 of 3, build complete (3 of 3 components), unverified end to end
created: 2026-08-07
updated: 2026-08-21
---

# Lab v0 — Lecture Ingestion

**Stack:** Next.js + TypeScript + Tailwind CSS + Supabase (Database + Storage) +
Sarvam. Technology is shared with the intended Product Platform; architecture is
not. The decision, its reasoning and its trade-offs live in
[`decisions.md`](../../.knowledge/decisions.md) (2026-08-07) — not here. See
[`lab/README.md`](../README.md) for what that separation means and the standing
constraints it implies (no Docker, no domain-concept naming, no auth, no
embeddings, disposable code).

## Milestone progress

| # | Milestone | Status |
|---|---|---|
| 0 | Clear the Sarvam blocker | **Done** — 2026-08-21 |
| 1 | Project scaffold & environment | **Done** — see below |
| 2 | Audio Ingestion (upload → store → transcribe → normalize → display) | **In progress** — see below |
| 3 | End-to-end run & close-out | Not started |

Milestone 2 folds what were originally three separate milestones (Audio
Ingestion / Transcript Normalization / Display) into one — a run isn't
independently verifiable as "working" until a transcript is visible, so
splitting at "audio sits in storage" wasn't a meaningful checkpoint.
Sarvam's Speech-to-Text is also async (Batch API, not the 30-second-capped
synchronous endpoint), so the `runs` lifecycle models a job, not a
request — `provider_job_id` is what makes an in-flight transcription
resumable across a refresh or restart.

**Milestone 2 components so far:**
1. **Done** — `runs` table migration + `scripts/setup-storage.mts` (bucket
   provisioning, not yet run against a live project).
2. **Done** — `POST /api/runs`: creates the row, mints a Supabase signed
   upload URL. Audio bytes never touch this server — confirmed against the
   installed Next.js docs that Route Handlers buffer the whole body via
   `formData()`, and against the installed Supabase client that it
   supports direct browser-to-Storage upload via signed URLs.
3. **Done** — the `TranscriptionProvider` interface, the Sarvam adapter,
   the transcribe/poll routes and the provenance module. The provider
   boundary collapses job states to `in_progress|completed|failed`, so
   nothing downstream knows the word "Sarvam" and swapping providers is a
   one-line change in `index.ts`. `provider_job_id` is written in the same
   statement that moves the run to `transcribing`, so a crash cannot leave
   an in-flight job unpollable. Provenance is written in the same `UPDATE`
   as the transcript — there is deliberately no code path that stores a
   transcript without one.

**Milestone 2's build is complete; Milestone 2 is not.** What remains is
**transcript normalization** (`transcript_normalized` is a column and a
`NormalizedTranscript` type, but nothing writes it) and **display** (there is
no upload UI and no transcript view — nothing in the app calls
`POST /api/runs`; `src/app/page.tsx` is still the Milestone 1 scaffold).
Both are deliberately not the next thing built — see "Blocked until" below.

**No live Sarvam call has ever been made.** Two things follow. Success
criterion 4 (Constitution VII, one-command regeneration) is unmet, and
`lab/data/README.md` records that as an obligation rather than a formality.
And one assumption is untested: Sarvam returns
`storage_container_type: "Azure_V1"` but does not document how to upload to
the presigned URL, so `uploadToPresignedUrl()` uses the Azure Blob SAS
convention (`PUT` with `x-ms-blob-type: BlockBlob`). It is isolated in that
one function precisely so the first live run can disprove it cheaply.

**Milestone 1, done 2026-08-07:** Next.js app scaffolded into this directory
(`src/app`, `src/lib`, `src/types`). Typed env access, an anon-key browser
Supabase client, and a `server-only`-guarded service-role client are in
place. `src/types/provenance.ts` defines the provenance contract later
milestones fill in. `supabase init` has run (config only — no local Docker
stack, per the standing ban). `npm run build` passes with zero real
credentials; `/` is confirmed dynamic (`ƒ`), not statically prerendered, so
the build never depends on reaching Supabase. Found and fixed a real bug
along the way: the scaffolded `.gitignore` was silently swallowing
`.env.example` (no negation, unlike the root `.gitignore`'s pattern) —
confirmed via `git check-ignore -v` before and after the fix.

**Both manual steps are now cleared (2026-08-19).** The Supabase project exists,
`.env.local` is populated, the migration is applied, the bucket is provisioned,
and a Sarvam API key is in place. What is still missing is not access but a
run: no audio has been sent to Sarvam.

## Goal

Get a real Hinglish lecture from an audio file to a readable transcript, with provenance
recorded, and find out what that actually costs in wall-clock time and quality.

The transcript is not the deliverable. **The deliverable is knowing whether transcription is
the project's bottleneck** — because if it is, the research question changes shape, and it is
far better to know that now than in month four.

**What this version does not do.** It does not validate the domain model, does not discharge any
part of the frozen [`walkthrough-protocol.md`](../../.knowledge/walkthrough-protocol.md), and is
**not a prerequisite for it** — the protocol's step 2 accepts any suitable ASR in about twenty
minutes. Lab v0 was chosen independently, to make transcription repeatable, measurable and
reproducible ([`decisions.md`](../../.knowledge/decisions.md), 2026-08-11). The walkthrough remains
the domain-model validation gate, and this version stays on the near side of it: bytes and
provenance, no domain concepts.

## Scope

Five steps. Nothing else.

```
Upload audio → Store audio → Transcribe (Sarvam) → Store transcript → View transcript
```

## Explicitly out of scope

Not "later" — **not in this version**, and adding any of them means v0 has failed at the only
thing it was for:

- Auth, or multi-tenancy of any kind.
- Extraction of any kind — no LLM, no patterns, no NER.
- Any field named `Commitment`, `Notice`, `Guidance`, `Observation` or `Attestation`.
  These are behind the gate. v0 handles bytes and provenance; that is what puts it in front
  of the gate.
- Chunking. A 40-minute lecture is roughly 6–8k words and probably fits one modern call.
  **Measure before building a chunker.**
- Embeddings, search, cross-lecture anything.

## Success criteria

v0 is done when all five are true:

1. One real Hinglish lecture goes end-to-end without manual intervention.
2. Every stored artefact carries its provenance: engine, **dated model snapshot** (never a
   floating alias), version, decoding parameters, commit hash. Recorded at write time, not
   retrofitted (Constitution IV).
3. The transcript renders correctly as Devanagari **read back from disk**, not merely printed
   to a console. Windows will fail this silently.
4. A second person can regenerate the transcript with one command (Constitution VII).
5. We can state, with a number, how long transcription takes and how good it is on
   **obligation-bearing sentences specifically** — not overall WER. Overall accuracy on a
   lecture is dominated by filler; what matters is the sentence containing the deadline.

## Two constraints that are easy to get wrong

**Serve the transcript as continuous prose with `[mm:ss]` markers — never as pre-cut
utterance rows.** The walkthrough's primary instrument is boundary agreement between two
annotators. Handing both of them the same pre-segmented rows would make them anchor on ASR
segment boundaries, inflate agreement, and trip the protocol's own suspicion trigger — sending
the team hunting for a conversation that never happened. This corruption is invisible and
unrecoverable: there is no second first-look at four lectures.

**Citations anchor to time in the audio**, not to any derived structure, so they survive
re-transcription ([`capture-contract.md`](../../.knowledge/capture-contract.md) Article 7).

## Blocked until

- [x] **Sarvam's terms on secondary use of submitted audio have been read.** Cleared
      2026-08-21: the vendor choice stands. Recorded late — the reading happened before the
      API key was obtained but was never written down, and no clause was kept. **If a
      specific term ever matters — retention, deletion, training use — re-read and quote
      it; do not rely on this line.**

**Not blocked, but next anyway — do not start Milestone 2's remainder.** Normalization and
display are ready to build and are deliberately not being built. `decisions.md` (2026-08-11)
named the stop condition for exactly this: *"If the next session again ends with Lab progress
and no walkthrough date, that is this decision going wrong, and the answer is to stop building
and book the day."* The 2026-08-19 session met it. The frozen walkthrough needs zero code and
[`roadmap.md`](../../.knowledge/roadmap.md) Stage A states plainly that Lab v0's progress does
not advance it.

Public lecture audio only. No real classroom recording until the consent and data-protection
position exists.

## Expect

**Unknown, and that is the point** — wall-clock time per lecture is one of the numbers this
version exists to produce. Sarvam's Batch API is asynchronous
([`decisions.md`](../../.knowledge/decisions.md), 2026-08-07), so the wait is the provider's queue
plus transcription, and it is polled rather than blocking a machine. Do not guess it; measure it.

If the Whisper fallback is ever exercised locally, that path is different and worse: on CPU a
40-minute lecture runs 30–90 minutes on `small` and up to four hours on `medium`, blocking the
machine throughout. Plan around it; do not discover it at 11pm.

---

## What was learned

*Filled in when v0 closes. Findings that change what the project believes go to
[`.knowledge/`](../../.knowledge/) — this section links to them rather than restating them.*

## Why it ended

*Filled in when v0 closes.*

## Replaced by

*Filled in when v0 closes.*
