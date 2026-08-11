---
status: In progress — Milestone 2 underway
created: 2026-08-07
updated: 2026-08-07
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
| 0 | Clear the Sarvam blocker | Not started |
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
3. Next — the `TranscriptionProvider` interface, the Sarvam adapter, and
   the submit/poll routes.

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

**Two manual steps remain before Milestone 2 can be run end to end.** They do not
block building it — components 1 and 2 are done without them — but nothing can be
verified against a live backend until they are cleared, and they need account
access:
1. Create a free Supabase project; copy its URL, anon key, and service-role
   key into `.env.local` (template in `.env.example`).
2. Clear the Milestone 0 blocker below, then get a Sarvam API key.

## Goal

Get a real Hinglish lecture from an audio file to a readable transcript, with provenance
recorded, and find out what that actually costs in wall-clock time and quality.

The transcript is not the deliverable. **The deliverable is knowing whether transcription is
the project's bottleneck** — because if it is, the research question changes shape, and it is
far better to know that now than in month four.

## Scope

Five steps. Nothing else.

```
Upload audio → Store audio → Transcribe (Sarvam) → Store transcript → View transcript
```

## Explicitly out of scope

Not "later" — **not in this version**, and adding any of them means v0 has failed at the only
thing it was for:

- Any database. JSONL and files.
- Any HTTP API, auth, or multi-tenancy.
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

- [ ] **Sarvam's terms on secondary use of submitted audio have been read.** A ten-minute
      check, a legal precondition to the first upload, and it could invalidate the vendor
      choice outright. Listed as "Next" since 2026-07-29 and still not done.

Public lecture audio only. No real classroom recording until the consent and data-protection
position exists.

## Expect

Whisper on CPU for a 40-minute lecture runs 30–90 minutes on `small` and up to four hours on
`medium`, blocking the machine throughout. Plan around it; do not discover it at 11pm.

---

## What was learned

*Filled in when v0 closes. Findings that change what the project believes go to
[`.knowledge/`](../../.knowledge/) — this section links to them rather than restating them.*

## Why it ended

*Filled in when v0 closes.*

## Replaced by

*Filled in when v0 closes.*
