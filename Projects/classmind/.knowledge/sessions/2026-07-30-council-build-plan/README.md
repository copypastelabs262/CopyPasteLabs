---
status: Draft
created: 2026-07-30
updated: 2026-07-30
---

# Council — 2026-07-30 — ClassMind Lab build plan

Three independent reviewers, briefed separately, no shared findings, each given a different
seat. **The three reports in this directory are stored verbatim, exactly as returned.** They
are not edited, not trimmed, and not reconciled with each other — that is the point. Read them
as three arguments, not as one document.

| File | Seat | Model | Assignment |
|---|---|---|---|
| `01-build-planner.md` | Build Planner | Opus | The concrete plan: all ten requested items, smallest end-to-end path to one lecture processed |
| `02-contrarian.md` | Contrarian / Gatekeeper | Opus | Attack "the Knowledge Engine is the product"; attack building now; attack the scope of "smallest"; rank what kills the build |
| `03-implementation-realist.md` | Implementation Realist | Sonnet | Hour estimates for *this* team on *their* machines; where it breaks; a 3-day plan; parallelisation under single-writer git |

**Limitation to record:** all three are Claude models. No cross-vendor diversity was available
in the harness, so they share blind spots a GPT or open-source reviewer might not. Weight the
convergences accordingly — agreement between three Claude agents is weaker evidence than
agreement across vendors would be.

---

## What they agreed on, independently

1. **Measure ASR quality on obligation-bearing sentences before anything else.** Unanimous. The
   Contrarian pre-registered that all three would say it, which is worth noting when weighing
   the consensus.
2. **The gate line is the same in two reports, in different words.** The Build Planner put it
   between milestones M2 and M3; the Contrarian put it as *"anything that names Commitment,
   Notice, Guidance, or an annotation unit is behind the gate; anything that handles bytes and
   provenance is not."* These are the same line, drawn by two agents who never saw each other's
   work. That convergence is the strongest signal the council produced.
3. **Provenance fields are the cheap non-negotiable** — model id, dated snapshot never a
   floating alias, prompt version, code commit. All three.
4. **Do not build Docker + Postgres for the Lab.** The Build Planner is the lone dissenter here
   and lost — see below.

## Where they split

**Storage.** Build Planner: 13 Postgres tables in Docker. Contrarian: JSONL files, no database
at all. Realist: SQLite, and warns Docker Desktop needs WSL2 + BIOS virtualization + admin
rights and **may simply fail on one of three student laptops**. Resolved against the Planner:
the Realist's objection is concrete and machine-specific, and the Contrarian's is deeper — a
table of Observations is a physical encoding of the taxonomy the walkthrough exists to test.
Article VII already specified "one flat table and a directory of JSONL files."

**Scale.** Build Planner: 13 tables, 7 Inspector screens, 8 milestones, FastAPI + Jinja + htmx.
Contrarian: three Python files, ~400 lines, no DB, no UI, no HTTP. Resolved substantially
toward the Contrarian — the Planner's design is good and belongs at Stage C; it is weeks of
work now, most of it encoding unvalidated concepts.

**Attestation in the Lab.** The sharpest split, and closer than it first appears. The Planner
argues it is mandatory (M4) or else Revision, Scope accumulation, coreference and Citation kind
— the four hardest concepts — are never exercised at all. The Contrarian argues the Lab
*cannot* produce a Ledger: no Authority exists over an NPTEL lecturer, and the team
self-attesting violates Article VIII and Challenge 4. Both are right, and the Planner had
already built the guard — `attestor_role='lab_operator'`, a permanent banner on the Ledger
screen, and a separate `research` schema that reported numbers come from. **Resolution: it is a
mechanism test, not a truth claim. Worth one day, but after the gate.**

## Three catches worth more than the plan

- **"Knowledge" is a banned word in the project's own domain model** (Part 7), and *"knowledge
  should be treated as the product rather than transcripts"* appears verbatim in the
  Constitution's *"Principles considered and rejected — recorded so they are not re-proposed
  later"* section. The framing that opened this council is that principle with "Engine" bolted
  on. This is a citation, not an opinion. Keep "Knowledge Engine" as the orchestrator's name if
  useful — it is a code component, no collision — but its **output is the Course Ledger**.
- **Serving the transcript as pre-cut Utterance rows would corrupt the walkthrough's primary
  instrument.** Both annotators would anchor on the ASR's segment boundaries, boundary agreement
  would inflate, and the protocol's own suspicion trigger would fire — sending the team looking
  for a conversation that never happened. Serve continuous prose with `[mm:ss]` markers instead.
- **The chunking problem may not exist.** The Contrarian called chunk-and-stitch "the actual
  engineering content of v1" at ~120 lines; the Realist points out a 40-minute lecture is only
  ~6–8k words and likely fits a single modern LLM call. Test before building.

## Numbers to plan against

From the Realist, with multipliers stated in the report: Whisper on CPU for a 40-minute
lecture is **30–90 min** (`small`) up to 4 hours (`medium`), and it blocks the laptop.
Devanagari on Windows fails **silently** — `?????` in PowerShell, CSV that looks fine in
Notepad and is corrupt everywhere else. Realistic total for a rough end-to-end pipeline:
**25–40 focused hours**, not an evening.

## The decision taken

Build, but ~400 lines rather than a platform, split across the gate:

1. **Before any code** (~1h40m, all three items already listed as "Next" two days ago, none
   started): fix the git push so Shiv and Darsh can read the frozen protocol; read Sarvam's
   terms on secondary use of submitted audio; send two faculty emails.
2. **Pre-gate:** `transcribe.py` (~150 lines) with provenance from the first line. Not a
   violation — steps 2 and 8 of the frozen protocol require transcription.
3. **Then the C4 measurement** — two hours, no code.
4. **Then the walkthrough.** One day.
5. **Post-gate:** `observe.py` (~200 lines) and `score.py` (~60 lines), output columns matching
   the walkthrough's 17-column template exactly, no field named `confidence`.

Stop before: any database, any HTTP API, any auth, any embeddings, any cross-lecture
coreference.

## Open, and untouched by any of this

The college partnership. The Contrarian ranks it the top project risk and notes the perverse
structure: the Lab runs fine on public lectures, so building it makes the partnership *feel*
less urgent at exactly the moment it is most urgent. No plan in this directory reduces that
risk. It is a phone call, not a milestone.
