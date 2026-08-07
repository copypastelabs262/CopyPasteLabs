---
seat: Build Planner
model: Opus
council: 2026-07-30 — ClassMind Lab build plan
verbatim: true
---

> Stored exactly as returned. Not edited, not trimmed. See `README.md` for what was accepted
> and what was overruled — in particular, the Docker + Postgres recommendation in item 6 was
> rejected in favour of JSONL/SQLite.

---

## 1. Files read

All under `E:\CopyPasteLabs\Projects\classmind\.knowledge\`:

- `domain-model.md` (all 8 parts + glossary + banned words)
- `constitution.md` (Article 0 + I–IX, scope note 2026-07-30)
- `capture-contract.md` (nine obligations + platform-binding note)
- `decisions.md` (2026-07-30 platform separation + the six 2026-07-29 entries)
- `walkthrough-protocol.md` (frozen; procedure, instruments, P1–P11, C1–C6, data template)
- `roadmap.md` (Stage A/B/C/D gating)
- `architecture.md` (Product Platform design — read to know what *not* to build)
- `project.md`, `requirements.md`, `progress.md`

Verified via `find`: no code exists anywhere in `Projects/classmind/`. Only `.knowledge/`.

---

## 2. The plan

### 1 — The smallest end-to-end Experiment Platform architecture

**Two processes. One language. No cloud.**

| Process | What | Why this |
|---|---|---|
| `postgres` | Docker, image `pgvector/pgvector:pg16`, two schemas: `lab` and `research` | pgvector already decided; extension installed but **unused in the Lab** (no Enquiry layer). Local, not Supabase: ₹0, no network dependency, no account admin, `docker compose down -v` resets the world |
| `api` | One FastAPI process: Jinja2 templates + htmx, server-rendered | One language (Python). No build step, no `node_modules`, no second repo, no CORS |

**No Next.js, no React, no Redis, no Celery, no S3, no MLflow, no ORM, no Alembic.**

What that costs later: the Lab UI is 100% throwaway (which is the plan — `decisions.md` says disposable), the founders get no React practice during Stage B, and hand-written SQL means more typing. Accepted. SQLAlchemy is a week of learning for a codebase that gets deleted.

**File layout — write exactly this:**

```
Projects/classmind/lab/          ← the entire Experiment Platform. Deleted wholesale at Stage C.
  DISPOSABLE.md                  ← one page: "this is not the product. Do not add auth."
  docker-compose.yml             ← postgres only
  Makefile                       ← make db / migrate / serve / ledger / reproduce
  pyproject.toml
  migrations/
    001_lab_schema.sql
    002_research_schema.sql
    003_ledger.sql
  prompts/
    llm_v1.md                    ← committed to git; sha256 stored on the Observer row
  engine/                        ← THE KNOWLEDGE ENGINE
    db.py            provenance.py     timeref.py
    pipeline.py      canon.py          evalharness.py    llm.py
    asr/     base.py  whisper_local.py  sarvam.py
    observers/ base.py  llm_v1.py  pattern_v1.py  ner_v1.py
  web/
    app.py                       ← FastAPI. Imports engine. Never imports a vendor SDK.
    templates/*.html   static/app.js
  cli.py                         ← python -m lab.cli <command>
  data/
    audio/                       ← gitignored
    manifest.csv                 ← COMMITTED: source_url, sha256, duration_s, licence
  runs/                          ← gitignored. The Article VII evidence directory.
    asr/{transcription_id}.json
    passes/{pass_id}.jsonl
    eval/{run_id}/{config.json,predictions.jsonl,metrics.json}
```

Dependencies, complete: `fastapi`, `uvicorn`, `jinja2`, `python-multipart`, `psycopg[binary]`, `faster-whisper`, `httpx`, `dateparser`, `regex`, `python-dotenv`. That is the whole list for M1–M5. `transformers`+`torch` arrive only at M6 (the NER arm).

---

### 2 — The first version of the Knowledge Engine, in code terms

`lab/engine/` is a Python package of roughly 700–900 lines. It is **not** an agent framework, **not** LangChain, **not** a DAG runner, **not** a message bus. If anyone installs Prefect or LangChain, they have misunderstood it.

It has exactly four responsibilities:

**(a) Stage sequencer — `pipeline.py`.** Five functions, each writing one layer of the Record:

```
ingest(offering_id, occurred_on, audio_path)     -> session_id, recording_id
transcribe(recording_id, engine)                 -> transcription_id
run_pass(transcript_id, observer_name)           -> extraction_pass_id
attest(observation_id, ruling, corrections)      -> attestation_id
fold_ledger(offering_id)                         -> counts    (in canon.py)
```

Every one is callable from `cli.py` and from `web/app.py`. Nothing else orchestrates anything.

**(b) Observer registry — `observers/base.py`.** A dict `OBSERVERS: dict[str, ObserverModule]`. Each Observer is one file declaring a module-level identity block and implementing one function:

```
observe(utterances: list[UtteranceDraft], session_date: date, tz: str,
        open_commitments: list[dict]) -> list[ObservationDraft]
```

Adding a comparison arm is one file plus one registry line. This is the Article VI *extraction-method swap* seam — one of only three seams in the Lab (the others are `asr/` and `llm.py`). Nothing else gets an interface.

**(c) Two intermediate representations, both plain dataclasses.** These *are* the "structured academic knowledge" claim expressed in code:

- `UtteranceDraft(start_ms, end_ms, speaker_label, text, asr_segment_confidence)` — the ASR↔Observer contract. Every ASR engine must produce it. **No Observer ever sees vendor JSON.** This is what makes the Sarvam/Whisper swap a one-line change.
- `ObservationDraft(utterance_ordinal, assert_kind, commitment_kind, deliverable, due_phrase, due_resolved, due_resolution_rule, submission_method, weight_phrase, scope_text, refers_belief, refers_to_hint, review_priority, raw)` — the Observer↔Ledger contract. A regex Observer and an LLM Observer must both fill this shape. **This dataclass is the single most important artefact in the Lab**, because it is where the domain model becomes executable.

**(d) Provenance stamper and the fold.** `provenance.py::stamp()` returns `{code_commit, ran_at, host}` from `git rev-parse HEAD`; `canon.py::fold_ledger()` drops and rebuilds `ledger_items` + `revisions` by replaying `attestations` in `created_at` order.

That is the Knowledge Engine. It coordinates models, defines the pipeline, owns the two IRs, decides what is persisted, builds the Ledger, and exposes it — which is exactly the founders' framing, made concrete in four files.

---

### 3 — The exact flow

```
[1] python -m lab.cli ingest --offering 1 --date 2026-08-05 --audio data/audio/lec01.m4a
      pipeline.ingest()
        sha256 the file, ffprobe duration
        INSERT lab.sessions  -> session_id
        INSERT lab.recordings (file_path, sha256, duration_seconds, media_type)

[2] python -m lab.cli transcribe --session 1 --engine whisper
      pipeline.transcribe()
        engine = {"whisper": asr.whisper_local, "sarvam": asr.sarvam}[engine]
        draft  = engine.transcribe(recording.file_path)      # -> TranscriptDraft
        write runs/asr/{transcription_id}.json               # VENDOR RESPONSE, VERBATIM
        INSERT lab.transcriptions (engine_name, engine_version, engine_params,
                                   raw_response_path, cost_inr, latency_ms, code_commit)
        INSERT lab.transcripts    (full_text)
        INSERT lab.utterances     (ordinal, start_ms, end_ms, text, asr_segment_confidence)
        UPDATE previous transcription SET is_current = false   # only allowed UPDATE in the Lab

[3] python -m lab.cli observe --transcript 1 --observer llm_v1
      pipeline.run_pass()
        obs_module = OBSERVERS["llm_v1"]
        observer_id = upsert_observer(obs_module.IDENTITY)   # (name,version) unique; immutable
        INSERT lab.extraction_passes (observer_id, transcript_id, started_at, code_commit)
        drafts = obs_module.observe(utterances, session_date, "Asia/Kolkata", open_commitments)
            └─ llm_v1 chunks utterances into ~15-min windows,
               renders prompts/llm_v1.md, calls engine.llm.complete(),
               calls engine.timeref.resolve(due_phrase, session_date, tz)
        append every raw model response to runs/passes/{pass_id}.jsonl
        INSERT lab.observations (one row per draft, incl. raw_model_json)
        UPDATE extraction_passes SET finished_at, cost_inr, latency_ms, token counts

[4] open http://localhost:8000/attest?offering=1
      POST /observations/{id}/attestations   ->  pipeline.attest()
        INSERT lab.attestations (ruling, corrected_fields, attestor_name,
                                 attestor_role='lab_operator', seconds_taken)
        NO write of any kind to lab.observations.

[5] make ledger        (= python -m lab.cli rebuild ledger --offering 1)
      canon.fold_ledger()
        TRUNCATE lab.ledger_items, lab.revisions
        for each attestation in created_at order:
            denied            -> nothing enters the Ledger
            confirmed, refers_to NULL      -> a Commitment/Notice/Guidance is born
            confirmed, refers_to set       -> a Revision on the existing Ledger Item
            corrected          -> same, using corrected_fields over the Observation's values

[6] open http://localhost:8000/ledger/1     ← the Inspector reads the Ledger
```

Total wall-clock for a 40-minute lecture: Whisper `small` int8 on CPU ~6–10 min, Sarvam batch ~2–4 min, one LLM pass ~40–90 s.

---

### 4 — The Inspector interface

Seven screens. Server-rendered Jinja, htmx for the attest queue. One shared `<audio id="rec" src="/media/recordings/{id}">` and a 10-line `seek(ms)` helper — every timestamp anywhere on any screen is a play button.

| # | Route | What it shows | Why it exists |
|---|---|---|---|
| S1 | `GET /` | Sessions table: id, offering, date, duration, current Transcription engine, #Passes, #Observations, #Attestations, #Ledger Items. Plus the ingest form | The only navigation |
| S2 | `GET /sessions/{id}` | Recording block (sha256, duration, source URL, licence). Transcriptions table (engine, version, params, cost, latency, `is_current`). Then the current Transcript as Utterance rows: `[mm:ss] [▶] text` | This is the citation surface **and** the walkthrough's reading surface |
| S3 | `GET /passes/{id}` | Header = the full Observer identity block: name, version, model_id, **model_snapshot**, prompt_version, prompt_sha256, decoding params, code_commit, cost, latency. Body = Observations: assert_kind, deliverable, `due_phrase → due_resolved (rule)`, refers_belief, review_priority, quoted Utterance + ▶ | Article IV rendered. If a number is ever questioned, this screen answers it |
| S4 | `GET /sessions/{id}/compare` | Three columns (llm_v1 / pattern_v1 / ner_v1), rows aligned by Utterance ordinal. Empty cell = that Observer saw nothing there | The research contribution made visible. Within 10 minutes it tells you whether pattern matching is hopeless |
| S5 | `GET /attest?offering=1` | One Observation per card, ordered by `review_priority` desc. Largest text on screen is the **verbatim Utterance**. Question printed literally: **"Did you say this?"** Keys: `y` confirm, `c` correct, `n` deny. Correction edits one field only. Stopwatch runs, writes `seconds_taken`. Header must say *"review priority (uncalibrated)"* | Article IX naming; Challenge 5 framing. The stopwatch column is the C5 instrument |
| S6 | `GET /ledger/{offering_id}` | Three sections — Commitments (due moment, Scope list, status), Notices, Guidance. Each Commitment expands into Revision history: what changed, when, which Attestation, ▶ to the Utterance. Banner: *"Derived. Rebuilt by `make ledger`. Attestor: lab operator — no Authority."* | The thing the whole Lab exists to produce |
| S7 | `GET /runs` | One row per `eval_run`: label, benchmark_version, observer, per-class P/R/F1, cost_inr, latency_ms, code_commit, timestamp, link to `predictions.jsonl` | Article VII on a screen |

Deliberately absent: any student view, any login, any chart library, any CSS framework beyond ~80 lines of hand-written CSS.

---

### 5 — Minimum backend services

**Two. `postgres` and `api`.**

There is **no job queue and no worker**. The CLI *is* the queue: `python -m lab.cli transcribe --session 4 --engine sarvam`. For unattended runs, `nohup ... &` or a `for` loop over session ids. Web endpoints that trigger work call the same `pipeline.*` function via FastAPI `BackgroundTasks`.

What that costs later: the Product Platform needs a real database-backed queue with retries and status polling (as `architecture.md` already says). In the Lab, a crashed transcription is re-run by pressing up-arrow-enter. That is the correct trade for a single-operator research system.

---

### 6 — Minimum database

Two Postgres schemas. `lab` and `research` never join. **That is Article VIII made structural rather than a column value**, and it costs nothing.

**Schema `lab` — 11 tables.**

```sql
lab.course_offerings
  id serial pk, label text, source_channel text, term_label text,
  lecturer_name text, timezone text default 'Asia/Kolkata'
-- Collapses Institution + Course + Term + Person + Appointment into one flat row.
-- The Lab has no Institution, no Person, no Authority. Stated, not forgotten.

lab.sessions
  id serial pk, course_offering_id int fk, ordinal int, title text,
  occurred_on date not null, source_url text, licence_note text,
  created_at timestamptz default now()

lab.recordings                                          -- RAW
  id serial pk, session_id int fk, file_path text, sha256 char(64) unique,
  duration_seconds numeric, media_type text, sample_rate int,
  created_at timestamptz

lab.transcriptions                                      -- RAW (the vendor response)
  id serial pk, recording_id int fk,
  engine_name text, engine_version text, engine_params jsonb,
  raw_response_path text, status text, is_current bool default true,
  requested_at timestamptz, completed_at timestamptz,
  cost_inr numeric, latency_ms int, code_commit char(40)

lab.transcripts                                         -- DERIVED
  id serial pk, transcription_id int fk unique, full_text text,
  language_hint text, created_at timestamptz

lab.utterances                                          -- DERIVED
  id serial pk, transcript_id int fk, recording_id int fk, ordinal int,
  start_ms int not null, end_ms int not null,
  speaker_label text default 'unknown', text text,
  asr_segment_confidence numeric
-- recording_id is denormalised ON PURPOSE: the durable citation anchor is
-- (recording_id, start_ms, end_ms), never a transcript row id. Capture Contract
-- obligation 7. Free to honour here; impossible to retrofit.

lab.observers                                           -- AUTHORED, immutable
  id serial pk, name text, version text, kind text,      -- llm|pattern|ner|person
  model_id text, model_snapshot text,                    -- snapshot NOT NULL for kind='llm'
  prompt_version text, prompt_sha256 char(64),
  decoding_params jsonb, code_commit char(40),
  created_at timestamptz,
  unique(name, version)
-- A changed method is a NEW ROW. Never an UPDATE.

lab.extraction_passes                                   -- RAW (a measured act)
  id serial pk, observer_id int fk, transcript_id int fk,
  started_at timestamptz, finished_at timestamptz, status text,
  input_tokens int, output_tokens int, cost_inr numeric,
  latency_ms int, code_commit char(40), notes text

lab.observations                                        -- RAW in substance; append-only
  id serial pk, extraction_pass_id int fk, session_id int fk, utterance_id int fk,
  assert_kind text,            -- commitment | notice | guidance | residual
  commitment_kind text,        -- assignment | quiz | exam | project | presentation | null
  deliverable text,
  due_phrase text,             -- "agle Thursday" — VERBATIM, never overwritten
  due_resolved timestamptz,    -- derived projection, rebuildable
  due_resolution_rule text,    -- derived projection, rebuildable
  due_timezone text,
  submission_method text, weight_phrase text, scope_text text,
  refers_to_hint text,         -- what the Observer thinks it concerns, in words
  refers_belief text,          -- new | certain | probable | contestable
  review_priority numeric,     -- NEVER named 'confidence'. Article IX.
  raw_model_json jsonb,        -- the model's own output, untouched
  created_at timestamptz

lab.attestations                                        -- AUTHORED, append-only
  id serial pk, observation_id int fk,
  ruling text,                 -- confirmed | corrected | denied
  corrected_fields jsonb,      -- only the fields the human changed
  refers_to_ledger_item_id int null,  -- the human's coreference ruling
  attestor_name text, attestor_role text default 'lab_operator',
  seconds_taken int, note text, created_at timestamptz

lab.ledger_items                                        -- DERIVED, droppable
  id serial pk, course_offering_id int fk, item_type text,
  commitment_kind text, current_deliverable text,
  current_due_at timestamptz, current_due_phrase text,
  current_submission_method text, current_scope text[],
  status text, born_from_attestation_id int, created_at timestamptz

lab.revisions                                           -- DERIVED, droppable
  id serial pk, ledger_item_id int fk, attestation_id int fk,
  field text, old_value text, new_value text, created_at timestamptz
```

Plus one **view**, not a table (cheaper, and it can never drift):

```sql
lab.citations AS
  select r.ledger_item_id, r.id as revision_id, u.recording_id, u.start_ms, u.end_ms,
         case when a.ruling='corrected' then 'corrected' else 'verbatim' end as kind,
         u.text
  from lab.revisions r join lab.attestations a on a.id=r.attestation_id
       join lab.observations o on o.id=a.observation_id
       join lab.utterances  u on u.id=o.utterance_id;
```

**Schema `research` — 2 tables. Never joined to `lab`.**

```sql
research.gold_annotations
  -- Columns mirror walkthrough-protocol.md's data template EXACTLY:
  id, benchmark_version, lecture_id, annotator, pass,       -- no_guide | with_guide
  unit_id, start_ms, end_ms, verbatim, unit_type, commitment_kind,
  deliverable, due_phrase, due_resolved, submission_method,
  refers_to, refers_confidence, hesitation_sec, hesitation_why, notes

research.eval_runs                                      -- Article VII
  id serial pk, run_label text, benchmark_version text, observer_id int,
  transcript_ids int[], per_class_metrics jsonb,          -- {commitment:{p,r,f1}, ...}
  boundary_agreement numeric, cost_inr numeric, latency_ms int,
  code_commit char(40), predictions_path text, created_at timestamptz
```

Total: 13 tables + 1 view. No `institution_id` anywhere — see §4 for the cost.

---

### 7 — API boundaries

Three rules, and they are the only architecture rules in the Lab:

1. `lab/engine/` **never imports FastAPI.** Everything in it is callable from a plain Python REPL.
2. `lab/web/` **never imports a vendor SDK.** It imports `pipeline` and `db` and nothing else.
3. **HTML routes never write. POST routes never render** — they return `303` to an HTML route, or JSON.

**Write endpoints:**

```
POST /course-offerings                      -> 303 /
POST /sessions                              -> 303 /sessions/{id}
POST /sessions/{id}/recordings              multipart; -> 303 /sessions/{id}
POST /sessions/{id}/transcribe              ?engine=sarvam|whisper  (BackgroundTask)
POST /transcripts/{id}/passes               ?observer=llm_v1|pattern_v1|ner_v1
POST /observations/{id}/attestations        {ruling, corrected_fields, seconds_taken}
POST /ledger/rebuild                        ?offering_id=1
POST /eval/runs                             {benchmark_version, observer_name}
```

**HTML read endpoints:** the seven Inspector routes in §4, plus `GET /media/recordings/{id}` (Starlette `FileResponse`, Range supported — required for audio seeking).

**JSON read endpoints, for scripts and for the report:**

```
GET /api/passes/{id}/observations.jsonl
GET /api/ledger/{offering_id}.json          ← the export used by the reproduction check
GET /api/runs.json
```

That is the complete surface: 8 writes, 7 HTML reads, 3 JSON reads, 1 media route.

---

### 8 — Which AI models are called at each stage

| Stage | Model / library | Notes |
|---|---|---|
| Transcription, primary | **Sarvam ASR (`saarika`, batch endpoint)**, `language_code="hi-IN"` | Built for Indian code-switching. Record the exact model string the API returns into `transcriptions.engine_version`, verbatim |
| Transcription, fallback / M1 | **`faster-whisper`, `large-v3`, `compute_type="int8"`, `language="hi"`** | Local, free, offline, no API key. Use `small` while developing, `large-v3` for the run of record |
| Diarization | **None.** `speaker_label = 'unknown'` | Skipped deliberately. Cost: student-question Utterances are not distinguished from the lecturer's. Irrelevant to Commitment extraction; would double the M1 budget |
| Observation — `llm_v1` (production arm) | **One hosted LLM, cheapest strong multilingual tier** (Gemini Flash class). Pinned to a **dated snapshot string**. If the provider only exposes a floating alias, read the snapshot from the response body and store *that* | Article IV. `model_snapshot` is `NOT NULL` for `kind='llm'` at the schema level |
| Observation — second LLM arm | **One model from a different family** (GPT-mini class), same prompt, new `observers` row | Gives a cross-family comparison for the paper at roughly zero extra engineering |
| Observation — `pattern_v1` | **No model.** `regex` + a hand-written Hinglish cue lexicon (`submit`, `due`, `deadline`, `jama kar`, `karna hai`, `exam mein aayega`, `assignment`, `viva`) | The baseline the research predicts will lose. Two hours of work |
| Observation — `ner_v1` | **`ai4bharat/IndicNER`** via `transformers`, CPU, local + `dateparser` | Free. Extracts DATE/ORG/WORK entities; a rule layer turns entity clusters into `ObservationDraft`s |
| Date resolution | **`dateparser`**, `RELATIVE_BASE=session.occurred_on`, `TIMEZONE='Asia/Kolkata'`, plus a ~30-entry Hindi rule table (`kal`, `parso`, `agle`, `is hafte`) | Writes `due_phrase`, `due_resolved`, `due_resolution_rule` — three columns, Article IV's stated highest-value-per-line |
| Embeddings / retrieval | **None.** | The Lab has no Enquiry, Response or Conversation. pgvector installed and unused |
| Coreference (`refers_to`) | **No separate model.** `llm_v1` receives the list of open Commitments in its prompt and must emit `refers_belief ∈ {new, certain, probable, contestable}` | Challenge 9 honoured for the price of one prompt section. The human settles it at S5 |

**Budget control:** `cost_inr` and `latency_ms` are columns on `transcriptions`, `extraction_passes` and `eval_runs`. Write them on every run. The ₹3,000 ceiling becomes a `SELECT sum(cost_inr)`, measured rather than estimated. Do the first Sarvam call on a 5-minute clip and multiply.

---

### 9 — Permanent vs. regenerated

Using Article II's classification. Article VII adds the requirement that every reported number be regenerable by one command.

**Permanent — never regenerated, back these up:**

| Artefact | Class | Where |
|---|---|---|
| Audio files + `manifest.csv` (source URL, sha256, duration, licence) | **Raw** | `data/audio/` (gitignored) + `data/manifest.csv` (committed) |
| Vendor ASR response, exactly as returned | **Raw** | `runs/asr/{id}.json` + `lab.transcriptions` |
| Raw LLM responses per Pass | **Raw** | `runs/passes/{id}.jsonl` + `observations.raw_model_json` |
| `lab.observers` rows and the prompt files | **Authored** | `lab.observers` + `prompts/*.md` in git |
| `lab.attestations` | **Authored**, append-only | `lab.attestations` |
| `research.gold_annotations` + frozen benchmark manifest | **Authored** | `research` schema |
| `research.eval_runs` + `runs/eval/{id}/predictions.jsonl` | **Raw evidence** | Article VII. This is the capstone contribution |
| `observations.due_phrase`, `deliverable`, `scope_text` | **Raw** (the model's words) | Never overwritten by a rebuild |

**Regenerated — droppable and rebuilt by one command:**

| Artefact | Command | From |
|---|---|---|
| `lab.transcripts`, `lab.utterances` | `make rebuild-transcripts` | `runs/asr/*.json` |
| `observations.due_resolved`, `due_resolution_rule` | `make rebuild-dates` | `due_phrase` + `sessions.occurred_on` + `timeref.py` |
| `lab.ledger_items`, `lab.revisions` | `make ledger` | `lab.attestations`, replayed in `created_at` order |
| `lab.citations` | nothing — it is a view | |
| `eval_runs.per_class_metrics` | `make rebuild-metrics` | `runs/eval/*/predictions.jsonl` |

**The two tests that make this real, and both must be in the Makefile:**

- `make ledger && make ledger` produces a byte-identical `GET /api/ledger/1.json`. If it doesn't, some derived data has quietly become authoritative.
- `make rebuild-dates` after fixing a date bug re-resolves last month's dates. If it can't, `due_phrase` wasn't stored and the bug is permanently unfixable retroactively.

Note the one deliberate wrinkle: **Observations are immutable rows that carry two derived projection columns.** The domain model calls Observation immutable; Article IV requires the spoken phrase be kept beside the resolved value. Resolving that: `raw_model_json`, `due_phrase` and `deliverable` are never touched by any rebuild; `due_resolved` and `due_resolution_rule` are recomputed freely. Write this rule as a comment in `001_lab_schema.sql`.

---

### 10 — Milestones

**M1 — One lecture: audio to Utterances, on screen.** *One day, one person.*

Hour by hour: 0:00 repo skeleton + `docker compose up` postgres. 0:45 `001_lab_schema.sql` (first six tables) + `cli.py migrate` applying files in order against a `lab.schema_migrations` table. 2:00 `cli.py ingest` — sha256, `ffprobe` duration, three inserts. 3:00 `asr/whisper_local.py` returning `TranscriptDraft`, and `pipeline.transcribe()` writing `runs/asr/`, `transcriptions`, `transcripts`, `utterances`. 4:30 `web/app.py` with `/`, `/sessions/{id}`, `/media/recordings/{id}`. 6:00 the seek JS and mm:ss formatting. 7:00 run it end to end on one real NPTEL lecture and fix what breaks.

**Done when:** from a clean clone, `make db && make migrate && python -m lab.cli ingest ... && python -m lab.cli transcribe --session 1 --engine whisper && make serve` shows a real lecture's Utterances at `/sessions/1`, each with a working play button, and `runs/asr/1.json` contains Whisper's untouched output.

**M2 — Sarvam arm, and the ASR quality number.** *One day, one person.*

Add `asr/sarvam.py`. Run both engines over the same Recording. Then measure C4: take the obligation-bearing sentences only (the ones carrying dates, deliverables, requirements — identify them from the walkthrough's `verbatim` column), and score each engine on whether a human reading only that transcript can extract the item correctly.

**Done when:** `/sessions/1` lists two Transcriptions with distinct `engine_name`/`engine_version`/`cost_inr`/`latency_ms`, exactly one `is_current`, and a one-page note records the obligation-bearing error rate for each engine.

**← THE STAGE A GATE SITS HERE.** See answer B. M1–M2 are Capture-boundary only; M3 onward encodes the taxonomy the walkthrough might overturn.

**M3 — Knowledge Engine v1: the `llm_v1` Observer.** *Two days, one person.*

`prompts/llm_v1.md`, `engine/llm.py`, `observers/base.py`, `observers/llm_v1.py`, `timeref.py`, `pipeline.run_pass()`, screen S3. The prompt must contain the walkthrough's segmentation rule verbatim: *"One Observation is one thing a lecturer can confirm or deny with a single yes/no."*

**Done when:** `python -m lab.cli observe --transcript 1 --observer llm_v1` twice produces **two** `extraction_passes` and no duplicate Observations under one Pass; `/passes/1` renders the full provenance block with a non-null `model_snapshot`; every Observation with a due moment shows `due_phrase → due_resolved (rule)`; `runs/passes/1.jsonl` has one line per model call.

**M4 — The attestation screen.** *One day, one person.*

Screen S5, `POST /observations/{id}/attestations`, `pipeline.attest()`.

**Done when:** a founder attests 20 Observations in one sitting; `lab.attestations` has 20 rows including denials; `select count(*) from lab.observations where updated_at is not null` returns 0 because the column does not exist; `seconds_taken` is populated on every row.

**M5 — The Ledger fold.** *Two days, one person. This is the milestone that proves the domain model.*

`canon.fold_ledger()`, `003_ledger.sql`, screen S6.

**Done when:** `make ledger` run twice yields byte-identical `/api/ledger/1.json`; a Commitment announced in Session 5 and extended in Session 8 appears as **one** Ledger Item with **two** Revisions and two Citations that both play; an Exam Commitment has accumulated Scope entries from three different Sessions; a denied Observation appears nowhere in the Ledger and is still in `lab.observations`.

**M6 — The comparison arms.** *Two days, split across two people.*

`pattern_v1`, `ner_v1`, screen S4.

**Done when:** three Passes exist over the same Transcript, `/sessions/1/compare` shows them aligned by Utterance ordinal, and each arm's `cost_inr` and `latency_ms` are recorded.

**M7 — Benchmark and evaluation harness.** *Three days.*

`002_research_schema.sql`, a loader for the walkthrough CSVs, `evalharness.py`, screen S7.

**Done when:** `python -m lab.cli eval --benchmark v1 --observer llm_v1` writes one `research.eval_runs` row and `runs/eval/{id}/predictions.jsonl`; `/runs` shows per-class precision/recall/F1; `delete from research.eval_runs; make rebuild-metrics` reproduces identical numbers from the JSONL; and there is no SQL anywhere in the repo joining `lab.attestations` to anything in `research`.

**M8 — Reproduction check and export.** *One day.*

**Done when:** on a second machine, from a clean clone plus the audio downloaded via `manifest.csv` and verified by sha256, `make reproduce` regenerates every number in `/runs` — deterministic stages bit-identical, LLM stages at `temperature=0` with the recorded snapshot. `make export` writes `exports/evidence-YYYY-MM-DD.zip` containing `manifest.csv`, `runs/`, and a `pg_dump` of `research`.

---

## 3. Answers to A and B

### A. What is the Lab's output, and should it include attestation?

**Position: the Lab's output is a Course Ledger — a real one — and yes, the Lab must include the minimal attestation step. It is M4, one day of work, and it is non-negotiable.**

Three reasons, then the honest limitation.

**First, "Canonical Academic Knowledge" is not a term this project is allowed to use.** `Knowledge` is on the banned list (Challenge 3), and for a good reason: it collapses the Record and the Ledger, which have opposite properties. The founders' phrase maps onto exactly one thing in the ubiquitous language, and that thing is the **Course Ledger**. They should keep "Knowledge Engine" as the name of the *orchestrator* — it is a code component, not a domain concept, so there is no collision — and call its *output* the Course Ledger. Making that swap costs one find-and-replace today and gets expensive once it is in the report, the viva slides and the schema.

**Second, without attestation the Lab is uninformative, not merely incomplete.** A Lab that stops at Observations proves the Knowledge Engine can transcribe and classify. That is not the claim. The claim under test is the domain model's central move — that Ledger state is *folded* from an append-only log of human rulings, and that this is what makes a Commitment persist across four Sessions while its due moment moves. Skip attestation and `fold_ledger()` has no input, which means **Revision, Scope accumulation, Citation kind, and cross-session Commitment identity — the four hardest and most novel concepts in the model — are never exercised at all.** The platform would be disposable *and* would have told you nothing. M5 is the single most valuable milestone in this plan and M4 is its only possible input.

**Third, it is the cheapest screen in the build.** One Observation on screen, three keys, one insert. A day. There is no version of this trade that favours skipping it.

**Now the honest limitation, and it must be written into the code, not just the report.** The Lab has no **Authority**. The attestor is a founder, not the lecturer who spoke — and the domain model is explicit that someone who was not in the room is guessing, and that a guess dressed as an Attestation is worse than none because it carries authority it has not earned. So:

> **The Lab's output is an *unauthorised* Course Ledger. It is structurally valid and epistemically empty. It is a mechanism proof, not a truth claim.**

Enforce that, don't just say it. `attestations.attestor_role` defaults to `'lab_operator'`. Screen S6 carries the banner permanently. `research.eval_runs` may never read `lab.attestations` — which is why `research` is a separate Postgres schema rather than a column value (Article VIII: *"any schema where eval labels and product corrections are distinguished only by a column value"* is a violation). Every reported number comes from `research.gold_annotations`, which comes from the walkthrough, which is blind and double-annotated.

**Concepts the Lab explicitly cannot support** — state these in `DISPOSABLE.md` so nobody later mistakes absence for rejection:

| Concept | Lab status |
|---|---|
| Authority | **Absent.** Attestations are made without it. The single biggest gap |
| Consent Grant | **Absent.** Public lectures only. `sessions.licence_note` records the substitute |
| Institution, Person, Appointment, Enrolment | **Absent.** Collapsed into `course_offerings` text columns |
| Academic Calendar | **Absent.** Replaced by `sessions.occurred_on` + `Asia/Kolkata`. Holidays and breaks are unresolvable — record it when a date resolution fails for that reason |
| Course Material | **Absent** |
| Enquiry, Response, Conversation | **Absent.** No student layer |
| Notice supersession, Commitment closure | **Present in schema, untested.** Four consecutive lectures will not produce a full lifecycle |
| C5 (attestation cost) | **Unmeasurable in the Lab.** It needs a real lecturer with their own material. The protocol already decouples it — leave it decoupled |

Everything else — Session, Recording, Transcription, Transcript, Utterance, Observer, Extraction Pass, Observation, Attestation, Commitment, Notice, Guidance, Scope, Revision, Citation, Course Ledger, Gold Annotation, Benchmark — is present in the schema under its own name.

### B. Does the Lab conflict with the frozen walkthrough protocol, or compose with it?

**It composes — and more strongly than the roadmap currently assumes. M1 and M2 are literally steps 2 and 8 of the frozen protocol. Build M1 the day before the walkthrough and use it as the walkthrough's transcription tool.**

The protocol's step 2 says *"Transcribe lecture 1 with whatever ASR is nearest to hand; record engine and version — 20 min."* Step 8 says *"Transcribe lectures 2–4 — 90 min"* (bundled with extraction). **M1 is exactly that tool**, and it does the recording-of-engine-and-version automatically instead of by hand in a notes file. Without it, the annotators paste audio into a web transcription tool and the engine/version discipline the protocol asks for survives only as long as somebody remembers to write it down.

M1 also gives the walkthrough two things it currently lacks:
- `start_ms`/`end_ms` per Utterance, so the protocol's `start_time`/`end_time` columns are read off the screen rather than estimated by scrubbing.
- A stable audio player with seek, which is what makes the hesitation instrument workable — an annotator can re-listen to a five-second span without losing their place.

And M7 consumes the walkthrough's output directly: `research.gold_annotations` mirrors the protocol's data template column for column. That is deliberate. It means the walkthrough CSVs become the frozen Benchmark by a loader script rather than by a re-annotation exercise, and it means the Lab's `assert_kind` values are constrained to the protocol's `unit_type` values rather than drifting into a parallel vocabulary.

**Where the genuine conflict sits — and it is a real one:** the roadmap says *"Nothing downstream — product architecture, navigation index, schema, dashboards, implementation — begins until the results document exists."* M3 onward writes the taxonomy into `observations.assert_kind` and into `prompts/llm_v1.md`. If prediction P7 lands and policy/condition statements earn a fourth Ledger item type, both need changing. So:

> **The Stage A gate falls between M2 and M3, not before M1.**

The justification is precise, not a convenience: M1 and M2 live entirely inside the **Capture** boundary, which the domain model defines as *"everything here is about faithfully recording what happened, with zero interpretation."* The walkthrough tests **Interpretation** and the **Ledger taxonomy**. No walkthrough result can invalidate a Session, a Recording, a Transcription, a Transcript or an Utterance — those concepts are not under test, and every criterion C1–C6 presupposes them. Building M1 is not "infrastructure ahead of the thing it serves"; it is building the thing the walkthrough's own step 2 requires.

**One trap worth naming, because it would silently corrupt the walkthrough's headline number.** The protocol's primary instrument is **boundary agreement** — did two annotators independently draw the same units? If the Inspector presents the transcript as pre-cut Utterance rows, both annotators will anchor on Whisper's segment boundaries and boundary agreement will be inflated, which the protocol's own suspicion trigger would then misread as evidence the annotators talked. **For the walkthrough only, serve the transcript as continuous prose with `[mm:ss]` markers every 30 seconds, not as one row per Utterance.** That is a five-line Jinja conditional (`?view=continuous`) and it protects P1, P3 and C3. Add it to M1.

---

## 4. What I deliberately left out, and why

| Left out | Why | What it costs later |
|---|---|---|
| Auth, student dashboard, faculty dashboard, notifications, analytics | Per the brief and per `decisions.md`. Their absence is the enforcement mechanism that stops the Lab shipping | Nothing. This is the plan |
| `institution_id` on every row | The Capture Contract binds the Product Platform, not the Lab. Adding tenancy to a disposable system is ceremony | The Lab's data cannot be handed to a college and the Product Platform's schema starts empty. Both are already the plan |
| Consent Grant plumbing | Public NPTEL lectures. Substituted `sessions.source_url` + `licence_note` | Must be built before the *first real recording*, which is Stage C, not Stage B. Already on the roadmap |
| pgvector, embeddings, retrieval, RAG | The Lab has no Enquiry layer. The domain model explicitly demotes retrieval: *"ordinary lookups over a few hundred items, not a search problem"* | Nothing at Lab scale |
| Speaker diarization | Would roughly double M1. Does not affect Commitment extraction | Student-question Utterances are indistinguishable from the lecturer's. Revisit only if it corrupts extraction, which is measurable at M3 |
| Celery / Redis / a real job queue | The CLI is the queue for a single operator | The Product Platform needs one. Already in `architecture.md` |
| Next.js / React / Tailwind | Two languages for three learners is a stated cost. The Lab UI is thrown away | No React practice during Stage B. Accepted |
| SQLAlchemy or any ORM; Alembic | psycopg3 + numbered `.sql` files. Migrations are applied forward only; you drop the database instead of downgrading | Hand-written SQL. Fine for 13 tables |
| MLflow / Weights & Biases | Article VII forbids them by name | Nothing |
| A test suite | Two tests only: the ledger-fold golden file (`make ledger` twice, diff the export) and a schema round-trip. The Article II rebuild commands are the real regression tests | Bugs found by running the pipeline, not by CI. Correct for a research spike |
| Automated cross-session coreference | Challenge 9 says the identity judgement must not be resolved silently. `llm_v1` emits a *belief*; the human settles it at S5 | This is the design, not a shortcut. It is also how C1 gets measured for free |
| CI, Docker for the app, deployment | The Lab runs on a laptop | The evidence must reproduce on a *second* laptop — that is what M8 checks, and it is the only portability requirement |

---

## 5. The three riskiest parts, and confidence

**Risk 1 — ASR on Hinglish is the bottleneck, and everything after M2 measures the wrong thing.** This is the project's own stated #1 unvalidated assumption, repeated in `requirements.md`, `architecture.md` and `roadmap.md`. If Sarvam and Whisper both garble obligation-bearing sentences, then M3–M7 produce a precision number for *transcription*, not extraction, and C4 sends the research question back to the drawing board. **Likelihood it materialises to some degree: high (~50%). Likelihood it is fatal: low (~10%)** — P10 predicts obligation-bearing sentences survive even when overall quality is poor, because deadline announcements are usually the most clearly enunciated speech in a lecture. The mitigation is structural: M2 exists solely to answer this before M3 is written, which is why the gate sits where it does. **Confidence in the mitigation: high.**

**Risk 2 — the taxonomy fossilises into `observations` and `prompts/llm_v1.md` before the walkthrough result exists.** If P7 lands and a fourth Ledger item type is earned, `assert_kind`, the prompt, `canon.fold_ledger()` and screen S6 all change. Two mitigations: the M2/M3 gate, and `raw_model_json` — because the model's full output is kept, re-normalising into a new taxonomy is a *rebuild* (free, offline) rather than a *re-run* (costs money and a new Observer version). **Likelihood the taxonomy shifts: moderate (~35%), and the walkthrough is designed to make it shift. Confidence the mitigation makes the shift cheap: high** — this is precisely the property Article 0 is asking for, and `raw_model_json` is the one column that delivers it.

**Risk 3 — the Lab becomes the product.** `decisions.md` names this failure mode explicitly and says the guards are the missing production concerns, not good intentions. The specific vector I would bet on: FastAPI + Jinja + htmx works *well enough* that around M5 someone says "we could just add Supabase Auth and a student view." The guards I have built in are that there is no `institution_id` anywhere (so tenancy is a migration, not a column), no `persons` table (so auth has nothing to attach to), a hardcoded `attestor_role='lab_operator'`, and `lab/DISPOSABLE.md`. **This is a discipline risk, not a technical one, and discipline risks are the ones that actually fail. Confidence: medium.** The one additional guard I would add: put a date in `DISPOSABLE.md` — *"this directory is deleted on the day Stage C begins"* — because a deletion with no date is a deletion that never happens, exactly as a suspension with no expiry condition is a repeal.

**Overall confidence.** High that M1–M5 are buildable exactly as specified by three learners with AI assistance in roughly three weeks of part-time work, and that M1 fits one day. High that the plan does not violate Articles IV, VII, VIII or IX — each is discharged by a named column, table, directory or Makefile target rather than by intention. Medium on M7, because the Benchmark depends on the walkthrough producing usable CSVs *and* on the college partnership for the real 15–20 lectures, which is outside the Lab's control and is already the project's largest open blocker. Nothing in this plan reduces that risk, and nothing can — it is a phone call, not a milestone.
