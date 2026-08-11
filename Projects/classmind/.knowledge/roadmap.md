---
status: Draft
created: 2026-07-29
updated: 2026-07-30
---

# Roadmap — ClassMind

## The shape: evidence before architecture

```
   Experiment Platform  ──►  Evidence  ──►  Validated Concepts  ──►  Product Platform
   (disposable code,          (numbers +     (the domain model        (what colleges use;
    non-disposable evidence)   provenance)    survives reality)         designed from evidence)
```

Two systems, not one that evolves — see the 2026-07-30 platform-separation entry in
[decisions.md](decisions.md). Every arrow above is a **gate**: the next stage does not begin
until the previous one has produced its output. Nothing is built on the domain model until the
domain model has survived contact with real lectures.

### Why not the synopsis order

The synopsis (`research/2026-07-24-synopsis-full.md` §13) sequences the work by architecture
layer: month 1 speech → month 2 patterns → month 3 NER → month 4 LLM → month 5 database →
month 6 dashboard → month 8 evaluation. That ordering builds the weakest component first,
produces nothing working until month six, and does not touch real lecture data until month
eight — by which point the hardest input problem has no time left to react to. This roadmap is
sequenced by **risk and by evidence**, not by layer.

---

## Stage A — Validate the concepts *(now; no software)*

The next step needs zero code. It is the frozen [walkthrough-protocol.md](walkthrough-protocol.md):
two people, manually, over public lecture transcripts, testing whether the domain model
survives real speech and whether two people apply it the same way.

- [ ] Run the walkthrough. Produce the results document (observations → interpretation →
      decisions, kept separate)
- [ ] Written verdict on each of the domain model's five open questions
- [ ] **Decide, on evidence:** freeze the conceptual model, or simplify it

In parallel — these have the longest lead times and depend on people outside the team, so they
start now regardless of the walkthrough:

- [ ] **Start the college partnership conversation.** Nothing downstream matters if this fails.
      Identify 2–3 faculty who teach in Hinglish and would let us record.
- [ ] Draft the consent and data-retention position. Required before the first *real* recording
      (not before the walkthrough — that uses public lectures). See
      [capture-contract.md](capture-contract.md) Article 8.
- [ ] Read Sarvam's terms on secondary use of submitted audio before any upload.

**Nothing in Stage A is blocked on software.** Step 2 of the frozen protocol accepts any suitable
ASR — twenty minutes, engine and version recorded. Lab v0 is not a prerequisite here and its
progress does not advance this stage. The walkthrough remains unrun and remains the gate.

**Gate:** the conceptual model is frozen only when the walkthrough's exit criteria are met. If
they are not, the model is too speculative for the evidence available — simplify it, do not run
ten more lectures.

---

## Stage B — Experiment Platform *(disposable; only if volume experiments are needed)*

The research engine. Its **code is throwaway; its evidence is the capstone contribution and is
not.** Bound by the research-validity articles (Constitution IV, VII, VIII, IX), exempt from
the production-data articles.

Minimum capability, nothing more: audio in → storage → speech-to-text → transcript storage →
LLM extraction → store results → bare attestation screen → export.

**Started early, deliberately (2026-08-07).** Lab v0 (`lab/v0-ingestion/`) is in progress ahead of
the Stage A gate — a recorded choice, not a gate crossing: it produces transcripts and provenance,
and encodes no domain concept. It answers the first bullet below and nothing else on this list.
See [decisions.md](decisions.md), 2026-08-07. Every remaining Stage B item stays behind the gate.

- [ ] **Measure ASR quality on Hinglish first**, on obligation-bearing sentences specifically.
      If transcription is the bottleneck, the research question changes shape — know this in
      week 2, not month 4.
- [ ] Build the three extraction approaches as swappable comparison arms behind one interface:
      LLM (production path), pattern matching, NER. *Comparison arms, not sequential upgrades.*
- [ ] Assemble the frozen **Benchmark**: 15–20 real lectures, independently double-annotated,
      Cohen's κ measured and reported. Kept strictly apart from any faculty corrections
      (Constitution VIII).
- [ ] First real precision/recall numbers. Expect disappointment — that is information.
- [ ] Confidence calibration, or rename the field (Constitution IX)
- [ ] Error analysis split by code-switched vs. monolingual segments — **this is the paper**

**Gate — validated concepts:** the domain model has held, the research numbers exist and are
reproducible. Only now does product design begin. *(If Stage A answered enough and volume
experiments prove unnecessary, this stage may be skipped — decide on evidence.)*

---

## Stage C — Product Platform *(only after the gate)*

The system colleges use. Designed from evidence, bound by the full Constitution and the
[capture-contract.md](capture-contract.md). [architecture.md](architecture.md) is the *Product
Platform's* design and is not built until this stage.

- [ ] Product architecture pass, informed by what the experiments actually showed
- [ ] Physical schema — deliberately last, and soft, except the eight capture obligations
- [ ] Faculty review/attestation, measured against the 5-minutes-per-lecture budget
- [ ] Student dashboard: calendar, commitments, exam scope
- [ ] Enquiry/response with citations
- [ ] Cross-session commitment tracking (the Revision model)
- [ ] Auth and multi-tenancy wired through

---

## Stage D — Report and defence *(overlaps C)*

- [ ] Technical report; literature review re-verified; novelty claims softened to defensible
      wording
- [ ] Paper draft
- [ ] Explain the synopsis deviations to the guide, with evidence
- [ ] Demo rehearsal on a machine that is not the developer's

---

## Later — startup track *(post-capstone, do not pull forward)*

- Pilot with one real college for a full semester
- LMS integration — the actual distribution unlock
- On-premise LLM operation (the milestone behind the swappable-module decision)
- Mobile app
- Additional language pairs (Marathi–English, Tamil–English)
- Fine-tuned extraction model trained on accumulated faculty corrections

## Ideas

- Faculty-side analytics: which topics drew the most student attention before the exam
- "What did I miss?" — catch-up summary for a student who skipped a session
- Auto-generated revision material from exam-flagged Scope
- Let students flag a wrong Ledger item, routed to Authority for adjudication

## Done

- 2026-07-29 — Founder sign-off on the six architecture deviations (was Phase 0's blocker)
- 2026-07-30 — Two-platform development strategy adopted
