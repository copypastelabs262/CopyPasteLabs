# ClassMind / CopyPasteLabs — Context Handoff

**As of:** 2026-08-22
**Repo:** `E:\E\CopyPasteLabs` · `github.com/copypastelabs262/CopyPasteLabs` · branch `master`
**Written for:** an assistant picking up this work with no memory of the sessions below.

> **Read `CLAUDE.md` first — it is the charter and it governs behaviour.** This document is a
> factual record of what happened, not a substitute for it. Where the two disagree, `CLAUDE.md`
> wins and this file is out of date.

---

## 0. Read this before doing anything

**Everything is committed and pushed.** Section 4 below describes 2026-08-21, when it was not;
that is history now and its "NOT committed" markers are resolved. The database-ahead-of-repo gap
it describes is closed.

**The big change since: ClassMind V1, the actual product, exists and its end-to-end workflow is
verified.** It lives at `Projects/classmind/product/classmind-v1/` and is separate from Lab v0,
which is untouched and remains the research environment. See section 11.

**Building it crossed the frozen walkthrough protocol's stopping rule, deliberately and
completely.** Not on the technicality the 2026-08-11 entry could defend --- `extraction_candidates`
has a `kind` check constraint enumerating the domain model, built before the walkthrough that was
meant to validate it. Directed by Shyam on 2026-08-22 and recorded, with its cost stated, in
`Projects/classmind/.knowledge/decisions.md`. **Do not treat the frozen protocol as still
governing what may be built; do treat its results, when it runs, as a test of the categories now
in the schema.**

Two things to know before touching anything:

- **`scripts/autosave.sh` fires on `Write|Edit` and commits everything staged, not just the file
  that changed.** During a session with subagents it will sweep your in-progress work into a
  commit called `Auto-save: <file>.ts`. It does **not** fire for a commit made through the shell.
  Write the deliberate, well-messaged commit anyway; expect part of the diff to have already
  landed under an `Auto-save:` message, and say so in the message rather than pretending the
  history is clean.
- **Two test accounts exist in the live Supabase project.** `faculty.test@classmind.local` and
  `student.test@classmind.local`, both `ClassMindTest!2026`. **Delete them before any real use.**

## 1. What ClassMind is

Ingests recorded Indian college lectures — where lecturers code-switch between Hindi and English
mid-sentence — and extracts **structured, verifiable academic events** (assignments, submission
deadlines, exam scope, announcements), each with a confidence score and a click-back link to the
exact second it was spoken. Faculty **attest** ("did you say this?") rather than approve; only
attested items reach students.

It is simultaneously a college capstone and a startup attempt. The rule where those conflict:
**"Capstone deadlines win on schedule. Startup thinking wins on architecture."**

### The two-platform strategy (2026-07-30 decision)

Two separate systems, never one evolving into the other:

```
Experiment Platform  ──►  Evidence  ──►  Validated Concepts  ──►  Product Platform
   (lab/, disposable        (numbers +      (domain model          (product/, empty
    code, non-disposable     provenance)     survives reality)      by design)
    evidence)
```

Every arrow is a **gate**. `product/` contains only a README and must stay that way until the
concepts are validated.

### The gate that governs what may be built

> *anything that names Commitment, Notice, Guidance, or an annotation unit is **behind** the gate;
> anything that handles bytes and provenance is **not**.*

Lab v0 handles bytes and provenance only. That is why it is allowed to exist.

---

## 2. Frozen documents — do not edit

| File | Status |
|---|---|
| `Projects/classmind/.knowledge/walkthrough-protocol.md` | **Pre-registered and FROZEN.** Nobody edits it once annotation begins. |
| `Projects/classmind/.knowledge/constitution.md` | Frozen (9 articles + Article 0) |
| `Projects/classmind/.knowledge/capture-contract.md` | Frozen (9 obligations) |
| `Projects/classmind/.knowledge/domain-model.md` | Frozen (1297 lines) |

If one of these looks badly designed, record that in a results document and change it for the
*next* run. Editing a pre-registered document after seeing data destroys its purpose.

---

## 3. The knowledge pipeline (BuilderOS v2.0)

```
conversation → End-Session → AI-Memory/Inbox/ → Knowledge-Promoter → AI-Memory/01_…10_
```

**A session never writes to permanent `AI-Memory/01_…10_` or `INDEX.md`.** It writes candidates
into `AI-Memory/Inbox/`. Only `Knowledge-Promoter` promotes.

**`Knowledge-Promoter` does not exist** — `specification.md` is v0.0.0 "Placeholder",
`prompt.md` says "Status: NOT WRITTEN". So capture works and curation does not. Nothing can
currently leave the Inbox.

Directly writable during a session: project `.knowledge/` files, and `AI-Memory/Inbox/`.

---

## 4. What was done on 2026-08-21, in order

### 4.1 Documentation reconciliation (committed: `0e95642`, pushed)

The 2026-08-19 session had built Lab v0 Milestone 2 component 3 (Sarvam adapter, provider
boundary, transcribe/poll routes, provenance) as commit `b3db63b` — and left **no record**: no
session log, no `progress.md` entry, no roadmap line. Worse, `b3db63b` **was never pushed**;
`origin/master` stood at `98a7b7a` for two days.

Actions taken:

- Pushed `b3db63b`.
- Wrote the missing session log retroactively at
  `Projects/classmind/.knowledge/sessions/2026-08-19-milestone-2-component-3.md`. It carries a
  banner marking it reconstructed from the commit and code, with "What was decided" flagged as
  *inferred* rather than asserted.
- Prepended a `progress.md` entry dated 2026-08-21; added dated forward markers to the
  2026-08-07 blockers rather than editing them (that file's convention: entries are never
  rewritten).
- **Cleared the Sarvam terms blocker.** It had been listed "Next" since 2026-07-29 while an API
  key was already in `.env.local` — a *false* blocker. Shyam confirmed the terms were read and
  the vendor choice stands. Recorded with its provenance visible: the reading was never written
  down at the time, so `README.md` and `roadmap.md` both state it was recorded from memory and
  that **any specific term must be re-read and quoted, not recalled**.
- Updated `lab/v0-ingestion/README.md`, `roadmap.md`, `.env.example`, `project.md`.

**Root cause of the unpushed commit, which will recur:** `scripts/autosave.sh` is wired to
`PostToolUse` on `Write|Edit`. A commit made through the shell — exactly the deliberate,
well-messaged commit `CLAUDE.md` asks for — never triggers it. **The auto-push safety net covers
the incidental path and not the intentional one.**

> Practical consequence for any assistant working here: writing files via **Bash heredocs**
> does not trip the hook, which is how these sessions kept control of their own commits. That is
> a workaround, not a fix. Using Write/Edit here triggers `git add -A` + commit + push, which
> will sweep in every uncommitted change listed in §0.

### 4.2 First-ever End-Session run (committed: `53c39a6`, pushed)

`AI-Memory/Inbox/` **did not exist**. No commit in history carried the `Session capture:` prefix.
Permanent `AI-Memory/` held four substantive entries, all dated 2026-07-28, while project work
ran through 2026-08-19 — roughly three weeks with no captured knowledge.

Created `AI-Memory/Inbox/` with `README.md` and `_schema/` (three JSON Schema files), plus the
first entry:

```
AI-Memory/Inbox/_platform/2026-08-21T0449Z-reconcile-docs-and-first-capture/
  session.md  evidence.json  candidates.json  status.json  changes.patch
```

**7 candidates**, all with a stated basis, all `state: pending`. Two defects in the End-Session
skill were hit and recorded rather than worked around:

1. **Phase 2's boundary collapses.** Strategy 1 can't fire on a first run, strategy 2 never fires
   (prompt §D.2), and strategy 3's `git merge-base HEAD origin/<branch>` returns HEAD whenever the
   branch is pushed — which `autosave.sh` guarantees. Result: `commits: []` for a session that
   made a commit, and Phase 3 falls back to the reserved `_platform` slug.
2. **`Inbox/.lock` is not gitignored**, so Phase 8's `git add AI-Memory/Inbox/` would commit a
   transient runtime file. Worked around by releasing the lock before staging. **Not captured as
   a candidate** — the entry was already sealed and Inbox entries are write-once. Still open.

### 4.3 The database blocker and its migration (applied live, NOT committed)

`public.runs` existed but **no PostgREST role could read or write it**:

```
service_role: REFERENCES, TRIGGER, TRUNCATE   ← no SELECT/INSERT/UPDATE/DELETE
anon/authenticated: same
postgres: full
```

Every Lab v0 route calls `createServiceRoleClient()`, so `POST /api/runs` failed on insert with
`42501 permission denied for table runs` and nothing downstream ever ran. Confirmed it was a
GRANT problem, not RLS: RLS denial returns an empty array, never an error, and *both*
`service_role` and `anon` got `42501`.

Fix applied as migration `20260821052056_grant_runs_dml_to_service_role`:

```sql
grant select, insert, update, delete on public.runs to service_role;
```

`service_role` **only**. Granting `anon` would silently undo the deny-by-default design that
`create_runs_table` deliberately established (RLS enabled, zero policies).

Verified after: `service_role` true/true/true/true; `anon` and `authenticated` false on all four;
RLS still enabled; policy count still 0.

**Migration filename drift, pre-existing:** the local file is `20260807115407_create_runs_table.sql`
but the remote applied it as version `20260819104411`. They were already out of step before this
session. Suggests it was not applied via `supabase db push`.

### 4.4 The Lab v0 interface (NOT committed)

Before this, the app had **no upload UI and no transcript view** — `page.tsx` was the Milestone 1
scaffold and nothing called `POST /api/runs`. Built the first visible interface around the
existing backend, reusing every existing route.

**New files**

| File | Purpose |
|---|---|
| `src/lib/runs/normalize.ts` | Derives readable prose from `raw_transcription_response` **at read time**. Never persisted. Tries four shapes and returns `null` rather than a confident-looking empty transcript. |
| `src/app/api/runs/[id]/route.ts` | `GET` one run. The only read route. No list/filter/pagination. |
| `src/app/_components/shared.ts` | `RunView`, `RunSummary`, formatters. |
| `src/app/_components/RunDetails.tsx` | Metadata + provenance limitations + transcript viewer + Download button. |
| `src/app/_components/LectureLibrary.tsx` | Lists runs, opens one into `RunDetails`. |
| `src/app/_components/LabConsole.tsx` | Owns the one shared bit of state: a refresh counter. |
| `src/app/_components/LectureRunner.tsx` | The upload → transcribe → poll flow. |

**Modified files:** `src/app/api/runs/route.ts` (added `GET` beside the existing `POST`),
`src/app/page.tsx`, `src/lib/transcription/sarvam.ts`.

**Design points that are load-bearing, not cosmetic:**

- **Normalization happens on read, never on write.** `poll/route.ts` states the raw response is
  the artefact everything else is re-derivable from. If the normalizer is wrong, fix it and
  reload — no re-run, no paid API call.
- **The transcript renders as continuous prose with inline `[mm:ss]` markers, never pre-cut
  rows.** From `lab/v0-ingestion/README.md`: pre-segmented rows would make both walkthrough
  annotators anchor on ASR segment boundaries, inflate boundary agreement, and trip the
  protocol's own suspicion trigger. **This corruption is invisible and unrecoverable.**
- Upload uses `XMLHttpRequest`, not `fetch`, because fetch cannot report upload progress.
- Audio goes browser → Supabase Storage directly via a signed URL. Bytes never touch the Next.js
  server on upload.
- The Download button builds a `Blob` from the normalized transcript already on screen — never
  the raw Sarvam JSON, no server round-trip, filename `<original-without-ext>.txt`.

### 4.5 The three product fixes (NOT committed)

**1 — Roman/Latin script.** In `src/lib/transcription/sarvam.ts`, `JOB_PARAMETERS`:

```diff
-  mode: "transcribe",
+  mode: "translit",
```

Verified against Sarvam's documentation rather than assumed. Saaras v3 has five modes:

| mode | Output | Verdict |
|---|---|---|
| `transcribe` | `मेरा फोन नंबर है 9840950950` | what RUN 1 used |
| `translate` | `My phone number is…` | translation — destroys code-switching |
| `verbatim` | native script, no normalization | still Devanagari |
| **`translit`** | **`mera phone number hai 9840950950`** | **chosen** |
| `codemix` | `मेरा phone number है 9840950950` | *sounds* right, keeps Indic words in Devanagari |

`codemix` is the plausible-looking wrong answer. `translit` is the only mode that romanizes.
`decodingParams` is built from `{...JOB_PARAMETERS}`, so provenance records the mode automatically.

**2 — Lecture Library.** `GET /api/runs` added to the existing route file. Metadata only (no
transcript in the list payload), newest first, cap 100, no search/filters. Each row shows
filename, upload time, size, status, provider status, detected language, and a **View** button
that opens the run in the same `RunDetails` component the upload flow uses.

**3 — Download Transcript.** Described above.

Also fixed during this work: a genuine React bug lint caught — `setState` called synchronously
inside a `useEffect`, causing cascading renders. The library was restructured so all fetching
lives in the effect with `setState` inside promise callbacks, plus cancellation on unmount.

---

## 5. The application as it stands

**Location:** `Projects/classmind/lab/v0-ingestion/`
**Stack:** Next.js 16.3 (Turbopack) · TypeScript · Tailwind 4 · Supabase (DB + Storage) · Sarvam
**Run it:** `npm run dev` → **http://localhost:3000**

### Routes

| Route | Method | Does |
|---|---|---|
| `/` | — | The Lab v0 console: uploader, lecture library, transcript viewer |
| `/api/runs` | `POST` | Validates MIME/size, generates run id server-side, mints a signed upload URL |
| `/api/runs` | `GET` | Lists runs for the library (metadata only) |
| `/api/runs/[id]` | `GET` | One run + transcript normalized at read time |
| `/api/runs/[id]/transcribe` | `POST` | Streams Storage → Sarvam, writes `provider_job_id` in the same statement as `status='transcribing'` |
| `/api/runs/[id]/poll` | `POST` | One poll per call. Idempotent on terminal states |

### The flow

```
pick file → sha256 in browser → POST /api/runs → PUT to signed URL (progress %)
  → POST …/transcribe → poll …/poll every 5s → GET /api/runs/[id] → render
```

There is **no "mark uploaded" step and none is needed** — `transcribe` proves the upload by
downloading the object from Storage.

### Sarvam configuration (`src/lib/transcription/sarvam.ts`)

```ts
const JOB_PARAMETERS = {
  language_code: "unknown",   // auto-detect; Hinglish is code-switched by definition
  model: "saaras:v3",
  mode: "translit",           // ← changed 2026-08-21 from "transcribe"
  with_timestamps: true,
  with_diarization: false,
};
```

Batch API: `initiate → upload-files → PUT presigned URL → start → poll status → download-files → GET result`.

**Two things the docs do not confirm:** `with_timestamps` is *not* a documented job parameter,
and Sarvam states "chunk-level timestamps only (not word-level)". Inspecting real output confirms
this — `timestamps.words` contains **whole sentences, not words**, and `diarized_transcript` is
`null`. The normalizer handles it correctly, but its internal function is still named
`fromWordArrays`, which is now a misnomer.

**The one unverified assumption in the adapter:** Sarvam returns
`storage_container_type: "Azure_V1"` but does not document how to upload to its presigned URL, so
`uploadToPresignedUrl()` uses the Azure Blob SAS convention (`PUT` + `x-ms-blob-type: BlockBlob`).
It is isolated in that single function by design. **It now works in practice** — three runs have
completed through it.

---

## 6. Live infrastructure state (2026-08-21)

**Supabase project ref:** `kkjyfojcahlopsfpcdbw` (this is the public `NEXT_PUBLIC_SUPABASE_URL`
ref, not a credential). Keys live in `.env.local`, which is gitignored. **Never print or commit them.**

**Storage bucket `audio`:** private (`public: false`), limit **52,428,800 bytes (50 MiB)** — the
Supabase Free plan ceiling, not a preference. Allowed MIME: `audio/mpeg`, `audio/wav`,
`audio/x-wav`, `audio/mp4`, `audio/m4a`, `audio/webm`, `audio/ogg`. Bucket constants and
`src/lib/storage/runs-bucket.ts` agree exactly.

**Table `public.runs`:** RLS enabled, **0 policies** (deny-by-default). Only `service_role` has
DML. No FK to any course/session concept — deliberate, per the 2026-08-07 decision; which table a
future FK should target is exactly what the walkthrough exists to settle. **Do not add one.**

**Migrations applied remotely:**

```
20260819104411  create_runs_table
20260821052056  grant_runs_dml_to_service_role
```

**Practical sizing note:** a 40-minute lecture must fit 50 MiB. 128 kbps ≈ 37 MB fits;
192 kbps ≈ 55 MB does not. **64 kbps mono ≈ 18 MB is the safe encode**, and Sarvam gains nothing
from more.

---

## 7. Runs to date — the actual evidence

Six rows in `public.runs`, five objects in Storage. **Three completed, three orphaned.**

| id (short) | File | MB | mode | lang | time | Result |
|---|---|---|---|---|---|---|
| `ddc4a12e` | 8 Points DIT FFT Algorithm… | 28.4 | `translit` | en-IN | 43.1s | ⚠️ **Arabic — see 7.1** |
| `145acf39` | 8 Points DIT FFT Algorithm… | 28.4 | — | — | — | orphan `pending_upload`, no object |
| `ccf15fe1` | Course outline.mp3 | 10.5 | `translit` | en-IN | 27.2s | ✅ correct English |
| `18322b4a` | Course outline.mp3 | 10.5 | — | — | — | orphan `pending_upload`, object uploaded |
| `4a9e144e` | Class 12 … Electric Charges | 22.4 | `transcribe` | hi-IN | 51.3s | ✅ RUN 1, Devanagari, 114 markers |
| `22faea6c` | Class 12 … Electric Charges | 22.4 | — | — | — | orphan `pending_upload`, object uploaded |

**RUN 1 (`4a9e144e`)** is the reference artefact: 114 timed segments, 85,742 characters of prose,
`raw_transcription_response` md5 **`766f4480e48a8c264fdc65c17768c793`**, length 70,988.
Provenance `commitHash` is `53c39a6744fbf04c5975cd03ac56664e5fb9c34b-dirty` — honestly recorded
as dirty rather than passed off as a clean commit. **This md5 is the check that RUN 1's raw
artefact has not been altered.**

### 7.1 ⚠️ OPEN AND SERIOUS — `translit` produced romanized Arabic

Run `ddc4a12e`, an English/Hinglish lecture on the 8-point DIT FFT algorithm, transcribed as:

> *"Ahlanan bikum ya asdiqa'a fi ailati handasati almarahi. Fi hazaal video sa'aqumu bi halli
> mas'alatin musiratin lil ihtimami ta'tamidu 'ala khawarizimiyatin thamaniya point det FFT…"*

That is **romanized Arabic**, not romanized Hindi or English. The English technical terms leak
through intact (`point det FFT`, `DFT`), which confirms the audio really is the FFT lecture — the
model transliterated it into the wrong language.

**The likely cause is visible in the data:** `language_probability` is **0.617**, and
`language_code: "unknown"` asks Sarvam to auto-detect. Low-confidence detection plus `translit`
appears to produce a wrong-language romanization. The reported language was `en-IN` while the
output is Arabic, so **`provenance.language` cannot be trusted as a check on this failure.**

The contrast matters: `ccf15fe1` was *also* `en-IN` + `translit` and came out as correct English.
**So this is not deterministic — it is confidence-dependent, and it fails silently.**

**Candidate mitigation, NOT yet implemented and needing a decision:** set `language_code`
explicitly (`"hi-IN"` or `"en-IN"`) instead of `"unknown"`. That directly contradicts the
adapter's existing comment — *"Hinglish is code-switched by definition; let Sarvam identify it
rather than asserting hi-IN or en-IN and biasing the result"* — so it is a real trade-off, not an
obvious fix. **Do not change it without recording a decision in `decisions.md`.**

### 7.2 Orphaned `pending_upload` rows

Every successful run is preceded by an abandoned row for the same file, 1.5–5 minutes earlier.
`POST /api/runs` creates a row *before* the upload, by design, so any abandoned or failed attempt
leaves one behind permanently. Nothing cleans them up. They appear in the Lecture Library, which
is arguably correct — they are real rows — but the pattern suggests first attempts are failing
for a reason nobody has diagnosed yet.

---

## 8. Verification performed

| Check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0, all six routes registered |
| RUN 1 raw response unchanged | md5 identical before/after all changes |
| RUN 1 viewable + downloadable | 114 segments, 85,742 chars |
| `service_role` read/write | verified by real `INSERT … RETURNING` under `set local role`, rolled back |
| `anon` still denied | `42501` on both SELECT and INSERT |
| RLS enabled, 0 policies | confirmed after the grant |
| Storage upload leg | `HTTP 200`, object landed, then cleaned up |

**A recurring trap:** `next dev` and `next build` share `.next`, and a stale dev process will
serve old routes while hot-reloading component changes — producing a Next 404 **HTML** page from
an API route that the build clearly registers. If an API route 404s as HTML, **restart the dev
server before suspecting the code.** This cost time twice.

---

## 9. Constraints — what NOT to do

Standing instructions from the operator, still in force:

- Do **not** build: extraction, Course Context, notes, assignments, student AI, embeddings,
  vector search, dashboards, analytics, attestation, authentication, multi-course support, or any
  domain-model feature. All of it is behind the walkthrough gate.
- Do **not** modify the frozen documents in §2.
- Do **not** change the DB schema, add tables, change RLS, change Storage config, or change the
  50 MiB limit.
- Do **not** delete `raw_transcription_response` or remove provenance warnings.
- Keep `raw_transcription_response` the authoritative artefact; keep normalization derived at
  read time.
- Do **not** run a paid Sarvam transcription without explicit instruction.
- Do **not** build `Knowledge-Promoter` without being asked.
- Do **not** redesign the UI.

---

## 10. Where things stand and what is next

> **Superseded on 2026-08-22.** This section records where things stood at the close of
> 2026-08-21 and is kept unedited. Its "next" is no longer the next thing: ClassMind V1 was
> built and verified on 2026-08-22 (section 11), and the walkthrough it names as the blocker was
> deliberately bypassed rather than run. The walkthrough is still unrun and still worth running.

**Working:** upload → Supabase Storage → Sarvam Saaras v3 → transcript stored with provenance →
transcript viewed as prose with `[mm:ss]` markers → downloaded as `.txt` → listed and reopened
from the Lecture Library. The pipeline is real and has run end to end three times.

**Immediate open items, in priority order:**

1. **§7.1 — the Arabic transliteration failure.** Silent, confidence-dependent, and it makes the
   transcript worthless when it fires. Needs a decision on `language_code`.
2. **Commit and push everything in §0.** The database is ahead of the repo and the co-founders
   are blind to all of it.
3. §7.2 — diagnose why first attempts orphan a row.
4. `Knowledge-Promoter` does not exist, so the Inbox entry from §4.2 has no consumer.
5. End-Session defects from §4.2 (Phase 2 boundary, `Inbox/.lock`).

**The actual project gate, which none of the above advances:**

Stage A of `roadmap.md` — **run the frozen walkthrough**. Two annotators, four consecutive
lectures, manually, over public lecture transcripts. It needs **zero code**, and `roadmap.md`
states plainly that Lab v0's progress does not advance it.

`decisions.md` (2026-08-11) named its own stop condition: *"If the next session again ends with
Lab progress and no walkthrough date, that is this decision going wrong, and the answer is to
stop building and book the day."* **That condition has already fired once** (2026-08-19), and
every session since has been Lab work.

Also unstarted and long-lead: the **college partnership** (`project.md` calls it *"the item most
likely to sink the capstone"*) and the **consent / DPDP-2023 data-retention position**, required
before any real classroom recording. Everything so far has used public lecture audio only.

`Projects/classmind/walkthrough/` exists but is **half-built and inert** — a README, a
`.gitignore` and empty subdirectories. Templates were never written; the work was redirected
mid-build. Finish it, delete it, or leave it, but do not assume it is usable.

---

*Generated 2026-08-21. If `git log` shows commits after `53c39a6`, this file may be out of date —
check `Projects/classmind/.knowledge/progress.md` for anything newer.*

---

## 11. ClassMind V1 --- the product (2026-08-22)

`Projects/classmind/product/classmind-v1/`. Next.js 16 / React 19 / Tailwind v4 / TypeScript /
Supabase (same project as Lab v0, different tables and a different bucket).

### How to run it

```
cd Projects/classmind/product/classmind-v1
npm install
npm run setup:db          # creates the `lectures` storage bucket; idempotent
npm run dev               # http://localhost:3100
```

`.env.local` needs the four keys in `.env.example`. **`TRANSCRIPTION_PROVIDER=fixture` is
currently set**, which replays captured Lab v0 responses instead of calling Sarvam. Remove it to
transcribe for real --- and note that a real call costs money and has never been made from this
app.

### Verification suites --- run these before believing anything

```
npm run test:extraction   # 75 checks, offline, no server needed
npm run test:provenance   # 16 checks, offline, against the real captured responses
npm run test:e2e          # 67 checks, needs the dev server running
npm run test:languages    # 33 checks, needs the dev server running
```

`test:e2e` drives the whole product over HTTP as a browser would: sign in, create a course, add
context, upload 10.5 MB of real audio through a signed URL, transcribe, poll, extract,
confirm/edit/reject, then re-enter as a student and ask a question. Its load-bearing checks are
the negative ones --- a student's lecture payload carries zero candidates, a student cannot rule
on a candidate or trigger extraction, and the anon key cannot read any of the four tables
directly.

### The transcription fixture provider

`src/lib/transcription/fixture.ts`, selected by `TRANSCRIPTION_PROVIDER=fixture`. It replays three
**verbatim** Sarvam Batch responses captured during Lab v0 RUN 1 and exported once to
`fixtures/transcription/`. The product never reads Lab v0's `runs` table at runtime.

The response bytes are real, so normalization, evidence offsets and provenance are exercised
against genuine output; only the network call and the queue delay are simulated. Every provenance
record written this way begins its limitations with `REPLAYED, NOT TRANSCRIBED`. Sarvam is the
default, so nothing can fall back to replay by accident.

The fixture is chosen by matching its slug inside the uploaded filename, so uploading
`physics-class12-hi.mp3` replays the Hindi lecture and `fft-lecture-misdetected.mp3` replays the
wrong-language one.

### Section 7.1's Arabic failure --- what is now known

The `translit` bug is still **unfixed in Lab v0**. What changed is the understanding of it, and
the product now guards against it.

The critical detail, found on 2026-08-22 by driving all three fixtures through the running
server: **Sarvam reported `language_code: "en-IN"` on that run --- the correct code.** The
provenance mismatch check compares the reported code against the configured one, so on the one
run it was written for, it was unreachable. The only thing that flagged that transcript was the
engine's own 0.617 confidence clearing the 0.8 threshold by 0.183. At 0.85 the same Arabic text
would have carried no warning at all.

`src/lib/provenance/language-check.ts` reads the transcript instead. Function-word density,
measured over the three real responses:

| fixture | configured | reported | p | English function words | Devanagari |
|---|---|---|---|---|---|
| `course-outline-en` | en-IN | en-IN | 0.846 | **42.5%** | 0% |
| `fft-lecture-misdetected` | en-IN | en-IN | 0.617 | **3.9%** | 0% |
| `physics-class12-hi` | hi-IN | hi-IN | 0.999 | 0% | **76.3%** |

An order of magnitude apart, which is why a crude test suffices. It appends a limitation and
never blocks or edits a transcript, refuses to judge under 120 tokens, and stays silent for
`unknown`. It is **not calibrated** --- three lectures is not a calibration.

### Data model

Seven tables in `supabase/migrations/20260822090000_classmind_v1_core.sql`, plus a
`lectures.language_code` column applied separately. **RLS is enabled with zero policies on every
one of them**, exactly as `runs` does: the anon key can read nothing, and every read and write
goes through a server route holding the service-role key. That makes "no unverified information
reaches students" structural rather than a rule someone has to remember --- a student's browser
has no path to `extraction_candidates` at all.

`extraction_candidates` rows are **immutable proposals**; `candidate_reviews` rows are
**append-only verdicts**. An edit never overwrites the proposal and a rejection is retained, not
deleted. Confirmed knowledge is **derived** by joining the two --- there is no third table, so a
confirmed item cannot drift from what was actually confirmed.

Because candidates are immutable, a re-run under a bumped method version inserts alongside the
old rows. The lecture route returns only the newest version per method and reports
`supersededCount`; nothing is deleted, so method comparison stays possible.

### Known limitations

- **No live Sarvam call has ever been made from the product.** Constitution VII's one-command
  regeneration remains unmet for it, and the Azure Blob SAS upload convention in
  `uploadToPresignedUrl()` is still an untested assumption inherited from Lab v0.
- **No romanized-Hinglish ASR fixture exists.** The extraction lexicon has its heaviest coverage
  for exactly that case, and it is the case with the least real evidence behind it. The Hindi
  fixture is Devanagari; the English one is English.
- **Question answering retrieves, it does not generate.** `searchKnowledge` ranks confirmed items
  by term overlap and returns them with their evidence. It cannot hallucinate, because it can
  only return rows that exist --- and it will miss a paraphrase that shares no words with the
  item.
- **`rules` v1.1.0 is uncalibrated.** No precision or recall number has been measured against a
  benchmark. `confidence` orders the review queue and means nothing else.

