# Architecture — ClassMind

- **Updated:** 2026-07-29
- **Status:** v0.1 — signed off in principle, not yet validated by code

## Overview

An audio file goes in, a queue of proposed academic events comes out, a human approves them,
and approved events become the student-facing product. Everything else is detail.

The system is a **pipeline with a human checkpoint in the middle**. That checkpoint is not a
limitation we hope to remove — it is the design. It converts an unreliable AI output into
trustworthy data, and it produces our labelled dataset as a by-product.

```
  faculty uploads
   lecture audio
        │
        ▼
  ┌───────────┐     ┌──────────────┐     ┌─────────────────┐
  │  INGEST   │────►│  TRANSCRIBE  │────►│    EXTRACT      │
  │ store,    │     │ speech→text  │     │ transcript→     │
  │ queue job │     │ + timestamps │     │ proposed events │
  └───────────┘     └──────────────┘     └────────┬────────┘
                                                  │
                     ┌────────────────────────────┘
                     ▼
              ┌─────────────┐
              │   PROPOSED  │   ◄── nothing here is visible to students
              │   EVENTS    │
              └──────┬──────┘
                     │
                     ▼
        ╔═══════════════════════════╗
        ║   FACULTY REVIEW  (human) ║  ◄── the trust boundary
        ║   approve / edit / reject ║
        ╚═════════┬═══════════┬═════╝
                  │           │
        approved  │           │  every action, including
        events    │           │  rejections, stored as
                  ▼           ▼  labelled training data
           ┌─────────────┐  ┌──────────────┐
           │  STUDENT-   │  │  CORRECTION  │
           │  VISIBLE    │  │   CORPUS     │ ◄── the compounding asset
           │  KNOWLEDGE  │  └──────────────┘
           └──────┬──────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
   calendar,          search & Q&A
   assignments,       (every answer cites
   exam topics         its source timestamp)
```

## The one boundary that matters

**Proposed events vs. approved events.** Everything upstream of faculty review may be wrong;
nothing downstream may be. This single line determines most of the rest of the design:

- Students query approved data only. There is no code path from the extractor to a student's
  screen, which means an extraction bug can never become a wrong deadline.
- The extractor can be replaced entirely — different model, different technique, different
  vendor — without touching anything students see. The research can churn freely behind a
  stable product surface.
- Confidence scores are an input to the *reviewer's* attention, not a filter for students.
  High-confidence events sort to the top of the review queue so faculty can approve them
  quickly; low-confidence ones get scrutiny. Confidence never decides what a student sees —
  a human does.

We chose this boundary over the alternative (auto-publish above a confidence threshold,
review only the uncertain ones) because the failure modes are asymmetric. A missed assignment
is an inconvenience; a confidently wrong deadline is a student failing a submission, and one
of those destroys trust in the whole product permanently.

## Components

Each component below is a replaceable box. The interfaces between them matter far more than
what is inside them.

### 1. Ingest
- **Responsibility:** accept an audio file, store it, record which course and date it belongs
  to, and queue a processing job.
- **Owns:** the audio blob and lecture metadata.
- **Why separate:** upload must succeed instantly even though processing takes an hour. If
  these are the same request, a slow transcription looks like a broken website.

### 2. Transcription
- **Responsibility:** audio → text with timestamps, and a per-segment confidence signal.
- **Interface:** `transcribe(audio) → [{text, start, end, confidence}]`
- **Behind the interface:** Sarvam (built for Indian languages and code-switching), with
  Whisper as fallback. Both are swappable; nothing else in the system knows which ran.
- **Note:** transcription quality is an untested assumption and a candidate bottleneck.
  Measure it in Phase 1 — if the transcript is wrong, extraction accuracy is measuring the
  wrong thing.

### 3. Extraction *(the research core)*
- **Responsibility:** transcript → proposed academic events with confidence and source span.
- **Interface:** `extract(transcript, lecture_date) → [ProposedEvent]`
- **Behind the interface:** three interchangeable implementations — LLM (production),
  pattern matching (baseline), NER (baseline). Same interface, so the evaluation harness can
  run all three over the same input and compare. **This interface is what makes the research
  cheap**; without it, comparing approaches means three parallel systems.
- `lecture_date` is passed in because "next Thursday" cannot be resolved without it.

### 4. Event store
- **Responsibility:** hold lectures, proposed events, approved events, corrections, and
  embeddings.
- **Technology:** PostgreSQL with pgvector. One database, one truth.
- **Owns:** everything durable. This is the system's actual asset.

### 5. Review queue
- **Responsibility:** present proposed events to faculty efficiently and record their verdict.
- **Constraint:** under 5 minutes of faculty time per one-hour lecture. This is a hard budget
  that shapes the interface — sorted by confidence, keyboard-driven, bulk-approve for the
  obvious ones.
- **Side effect that is really the main effect:** writes the correction corpus.

### 6. Retrieval and Q&A
- **Responsibility:** answer student questions from approved events only, with citations.
- **Rule:** no answer without a source. If retrieval finds nothing relevant, the honest
  response is "that wasn't mentioned in your lectures" — never an LLM's guess.

### 7. Web app
- **Responsibility:** two interfaces — faculty review, student dashboard.
- Server-rendered pages, responsive. No mobile app.

## Technology

Chosen for boring reliability and documentation volume, not elegance — see
`project.md` § Team context.

| Layer | Choice | Why this one |
|---|---|---|
| Frontend | Next.js + React + Tailwind | Enormous documentation base; when stuck, an answer exists |
| Backend | FastAPI (Python) | Python is non-negotiable for the ML work; FastAPI is the simplest way to put a web API on it |
| Database | PostgreSQL + pgvector (Supabase) | One store for rows and vectors. Managed, so nobody administers a database |
| Job queue | Start with a database-backed queue | Simplest thing that works. Redis/Celery only when a measured problem demands it |
| Speech-to-text | Sarvam (primary), Whisper (fallback) | Built for Indian code-switching; fallback keeps a vendor outage from stopping work |
| LLM | Hosted API behind an internal module | See decisions.md. On-premise is a post-capstone milestone |
| Embeddings | Sentence Transformers, multilingual | Small, free, runs anywhere |
| Auth | Supabase Auth | Already there with the database; roles are `student`, `faculty`, `admin` |
| Hosting | Vercel (web) + Railway/Render (API) | Free tiers cover the capstone |

**Two languages (Python + TypeScript) for a three-person learning team is a real cost.** It
was accepted because the alternative — doing ML work in TypeScript — is worse. The mitigation
is a strict split: Python never renders UI, TypeScript never touches a model.

## Data model

Sketch, not a migration. Full schema arrives with the first code.

```
institutions        ── every table below carries institution_id
  courses
    lectures        ── audio ref, date, lecturer, transcript
      segments      ── text, start_time, end_time, asr_confidence
      events        ── the core table
           type            assignment | deadline | exam_topic | announcement
           content         normalised text
           due_at          resolved absolute datetime, nullable
           obligation      required | suggested      ← the product's whole point
           confidence      0.0–1.0
           method          llm | pattern | ner | manual
           status          proposed | approved | rejected | superseded
           source_segment  → the exact span it came from
           supersedes      → an earlier event this one modifies
      corrections   ── who changed what, from what, to what, when
      embeddings    ── pgvector, for search
```

Three fields carry more weight than they look:

- **`obligation`** — the difference between "please read Chapter 5" and "submit Chapter 5 by
  Friday" is the single distinction that separates ClassMind from a transcription tool.
- **`supersedes`** — makes a changed deadline a *modification* rather than a second
  contradictory event. Without it, a student sees two deadlines and trusts neither.
- **`source_segment`** — every claim traces to the moment it was said. Non-negotiable.

## External dependencies

| Service | Used for | If it disappears |
|---|---|---|
| Sarvam API | Transcription | Fall back to Whisper; accuracy on Hinglish likely drops — this is measurable, so measure it |
| LLM provider | Extraction, Q&A | Swap behind the module. Demos must never run live against it |
| Supabase | Database + auth | Serious. It is plain Postgres underneath, so migration is possible but disruptive |
| Vercel / Railway | Hosting | Low impact; alternatives are equivalent |

## Known weaknesses

Recorded now so they are accepted debt rather than surprises.

1. **Transcription quality is an unvalidated assumption.** If Sarvam handles our lecturers'
   Hinglish poorly, extraction accuracy measures the wrong thing and the research question
   shifts from "can we extract" to "can we transcribe." Phase 1 must measure this.
2. **The human checkpoint is a scaling bottleneck.** Faculty review does not scale to
   thousands of lectures. It is correct for the capstone and for a pilot; at scale it must
   become selective review with an earned-trust threshold. Deliberately deferred.
3. **No offline mode.** Everything needs a network. Fine for the capstone, a real limitation
   in Indian colleges with unreliable connectivity.
4. **Cross-lecture event tracking (`supersedes`) is the hardest unsolved piece.** Deciding
   that "I'm extending assignment 1" refers to an event from three lectures ago is a matching
   problem we have not designed. Expect it to be the biggest source of bugs.
5. **Two languages, three learning engineers.** Accepted, mitigated by the strict split above.
6. **No load, cost, or latency modelling.** Deliberate — we have no measurements yet, and
   guessing would violate
   [Principle 3](../../../AI-Memory/01_Principles/PRINCIPLES.md).
