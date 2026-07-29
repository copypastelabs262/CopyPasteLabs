---
status: Draft
created: 2026-07-29
updated: 2026-07-29
---

# Session — 2026-07-29 — ClassMind project definition and architecture sign-off

**Present:** Shyam (writing machine), Claude (engineering partner)

## Context

First session after BuilderOS was declared feature-frozen. The founders supplied five
documents produced on 2026-07-24 — one research/competitive analysis and four synopsis drafts
of decreasing length — describing ClassMind, the capstone product. Goal for the session: get
the research into the knowledge base and settle on a system architecture.

Also established this session: the three founders are college friends learning to build with
AI assistance rather than experienced engineers, the project is intended to become a real
startup after the capstone, and "ClassMind" is a working name that may change.

## What was decided

Six deviations from the synopsis, all confirmed by the founders. Full rationale, alternatives
and trade-offs in `../decisions.md`; summarised here for the reader who wants the shape
without the detail:

| # | Deviation | Core reason |
|---|---|---|
| 1 | LLM extractor first; pattern matching and NER as comparison baselines | Synopsis order builds the weakest component first and yields nothing working until month 5 |
| 2 | Hosted LLM behind a swappable module; on-premise as a post-capstone milestone | Llama 2 70B locally is an infrastructure project this team cannot afford in time |
| 3 | PostgreSQL + pgvector, drop FAISS | A separate index is a second source of truth with silent sync failures |
| 4 | No live in-lecture transcription in the capstone | Hardware and streaming complexity for zero research value |
| 5 | Multi-tenant schema from the first migration | Retrofitting tenancy means migrating live student data under pressure |
| 6 | Every faculty correction stored as labelled data | The only part of the system that compounds |

The architecture that follows from these is organised around one boundary — **proposed events
versus approved events** — with faculty review as the trust checkpoint between them.

## What was learned

**The synopsis was written to be read, not to be built.** It is a good document for its
purpose and its research is sound, but planning the build surfaced six problems that
describing the system did not. This is not a criticism of the authors; it is what happens
when a proposal is converted into a plan. The general form of this — *reviewing a design
document as a build plan finds different problems than reviewing it as a document* — is a
promotion candidate once a second project confirms it.

**The research contribution is separable from the build order.** The paper's finding is "we
compared three extraction approaches on code-switched classroom speech and here is what each
achieved." That comparison is identical regardless of which is built first, which is what
made deviation 1 safe. Recognising that a research obligation constrains *what must exist by
the end* rather than *what order things are built in* freed up months of schedule.

**Confidence scores were nearly used as an automatic filter for students.** They are now an
input to reviewer attention instead. The reasoning generalises: when failure modes are
asymmetric — a missed item is an inconvenience, a wrong item destroys trust — the threshold
should route human attention, never replace it.

## Open questions

- Will a partner college grant access to real lectures? Nothing else matters if not.
- Does current ASR handle our lecturers' Hinglish well enough that we are measuring extraction
  error rather than transcription error? Unvalidated assumption under the whole project.
- Has the synopsis already been formally submitted and graded? If so, the six deviations must
  be explained to the guide explicitly rather than quietly shipped.
- Are the novelty claims ("first system to...") defensible under a proper literature search?
  They were not re-verified and are the easiest thing for an examiner to puncture.

## Files changed

```
Projects/classmind
  + .knowledge/project.md              (written)
  + .knowledge/architecture.md         (written)
  + .knowledge/requirements.md         (written)
  + .knowledge/roadmap.md              (written)
  + .knowledge/decisions.md            (6 decisions)
  + .knowledge/progress.md             (first entry)
  + .knowledge/research/               (5 documents archived + index)
  + .knowledge/sessions/2026-07-29-project-definition.md

Projects
  ~ README.md                          (classmind added to catalogue)

Projects/builderos
  ~ .knowledge/roadmap.md              (auto-push blocker cleared)
  ~ .knowledge/progress.md             (session entry)
```

Nothing was written to `AI-Memory/` this session. The one generalisable candidate — reviewing
a design document as a build plan — is held locally until a second project confirms it, per
the routing rule.
