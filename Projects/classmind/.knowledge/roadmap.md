# Roadmap — ClassMind

- **Updated:** 2026-07-29

## How this differs from the synopsis timeline

The synopsis (`research/2026-07-24-synopsis-full.md` §13) sequences the work as
month 1 speech → month 2 patterns → month 3 NER → month 4 LLM → month 5 database →
month 6 dashboard → month 8 evaluation.

That ordering has a structural flaw: **nothing works end to end until month 6, and real
lecture data is not touched until month 8.** By the time the hardest input problem (getting
real lectures) surfaces, there is no time to react. It also means the first two college
reviews have no working system to show.

This roadmap inverts it on two axes:

- **Get one lecture through the entire pipeline in week 3**, however crudely. A thin slice
  that works end to end exposes the real problems immediately, while there is still time.
- **Start data collection in week 1, in parallel with everything.** It has the longest lead
  time and depends on people outside the team.

The phases below are still 8–10 months of work. They are sequenced by risk, not by
architecture layer.

## Now — Phase 0: Unblock (week 1)

- [ ] Founder sign-off on the six architecture deviations (see `decisions.md`)
- [ ] **Start the college partnership conversation.** Longest lead time of anything here.
      Identify 2–3 faculty who teach in Hinglish and would let us record. Nothing else in
      this roadmap matters if this fails.
- [ ] Draft the consent and data-retention position — what we record, who can see it, how
      long we keep it, how someone gets it deleted. Needed before the first real recording.
- [ ] Record 2–3 mock lectures ourselves, deliberately code-switched. Unblocks all
      development while the real-data conversation runs, and costs an afternoon.

## Next — Phase 1: Thin vertical slice (weeks 2–4)

One lecture, one course, no auth, no polish. Prove the concept end to end.

- [ ] Audio file → transcript with timestamps → events in a database → visible on a page
- [ ] **Measure ASR quality on Hinglish before building on top of it.** If transcription is
      the bottleneck rather than extraction, the project's shape changes and we need to know
      in week 2, not month 4.
- [ ] Manually eyeball the extraction output on a mock lecture — is this even the right
      problem shape?

**Gate:** if the slice does not work end to end, do not proceed to Phase 2. Fix or rethink.

## Phase 2: Extraction quality (months 2–4) — the research core

- [ ] Build all three extraction approaches as swappable strategies behind one interface:
      pattern matching, NER, LLM. They are *comparison arms*, not sequential upgrades.
- [ ] Annotate the first 3 real lectures; establish the annotation guideline document
- [ ] First real precision/recall numbers. Expect them to be disappointing — that is
      information, not failure
- [ ] Confidence calibration: at what threshold do we stop showing events to students?
- [ ] Error analysis split by code-switched vs. monolingual segments — **this is the paper**

## Phase 3: Product (months 4–6)

- [ ] Faculty review queue, measured against the 5-minutes-per-lecture budget
- [ ] Student dashboard: calendar, assignments, exam topics
- [ ] Search and Q&A with citations
- [ ] Cross-lecture event tracking (deadline changes)
- [ ] Auth and multi-tenancy wired through

## Phase 4: Evaluation (months 6–8)

- [ ] Full dataset to 15–20 lectures, annotated, κ measured and reported
- [ ] All three baselines run and compared
- [ ] Honest write-up of failure modes

## Phase 5: Report and defence (months 8–10)

- [ ] Technical report, literature review re-verified, novelty claims softened to defensible
      wording
- [ ] Paper draft
- [ ] Demo rehearsal on a machine that is not the developer's

## Later — startup track (post-capstone, do not pull forward)

- Pilot with one real college for a full semester
- LMS integration — the actual distribution unlock
- Mobile app
- Additional language pairs (Marathi–English, Tamil–English)
- Fine-tuned extraction model trained on our accumulated faculty corrections

## Ideas

- Faculty-side analytics: which topics got the most student attention before the exam
- "What did I miss?" — catch-up summary for a student who skipped a lecture
- Auto-generated revision material from exam-flagged topics
- Let students flag a wrong event, routed to faculty for adjudication

## Done

_(nothing yet)_
