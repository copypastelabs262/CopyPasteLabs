# Presentation Brief — Capstone Mid-Term Review 2

**Hand this whole file to Claude Design.** It contains the content, the structure, the
constraints and the exact tables. It does not contain the design — that is Claude Design's
job. Anything in `[SQUARE BRACKETS]` is a fact I do not have and you must supply.

---

## 1. What this presentation is

| | |
|---|---|
| **Event** | Capstone Project Mid-Term Evaluation (Review 2), MPSTME, SVKM's NMIMS |
| **Marks** | 25 — the second-largest single component of the 100-mark ICA |
| **Duration** | Part of a 10:00–12:00 session; assume **10–12 minutes of speaking** plus questions. Confirm your slot from the department schedule |
| **Audience** | A panel of faculty members **including your own project mentor**. They have read capstone presentations before and know this literature |
| **Format** | Presentation + **live demonstration of the working model** |
| **Expectation** | The department mail states 50–60% of the project should be finished, demonstrated as a working model |

## 2. The three things the department mail explicitly requires

Every one of these must be visibly present. A panel ticking a rubric should not have to hunt.

1. **A literature survey of at least five good papers, compared in table format.**
2. **Work done so far, and the project plan.**
3. **Demonstration of the project completed till now.**

## 3. The rubric the panel scores against

From Annexure A.4 of the guidelines. Five components, 5 marks each. **Build one section per
row, in this order.** This is the single most important structural instruction in this brief.

| # | Rubric component | Marks | What earns full marks |
|---|---|---|---|
| A | Literature Review / Market Survey | 5 | Complete understanding of existing research and products relevant to the topic |
| B | Clarity of the problem statement | 5 | Problem statement identified **after** identifying research gaps, objectives stated well |
| C | Design / system-level representation | 5 | System design well drawn, giving complete understanding of the proposed model; algorithms clearly stated |
| D | Implementation / Results | 5 | Model implemented, **more than 50% of work complete**, results well documented and shown |
| E | Interim Report | 5 | Complete explanation of key concepts, strong description of technical requirements, future extensions specified |

Note the ordering logic the rubric encodes: literature → gap → problem → design → results. That
is a funnel, and the deck should read as one.

## 4. Slide plan

Target 14–16 slides. Timings assume 11 minutes.

| # | Slide | Content | Time |
|---|---|---|---|
| 1 | Title | Project title, team names + roll numbers, mentor name, department, academic year | — |
| 2 | The problem in one picture | An hour-long lecture waveform with ~15 seconds highlighted: "submit the Chapter 5 analysis by Friday 5 PM". Caption: *the information exists; it is not actionable* | 0:45 |
| 3 | Why Indian classrooms are different | The code-switched sentence "यह बहुत important concept है जो exam में आएगा" rendered large. One line: off-the-shelf tools are built for monolingual English | 0:45 |
| 4 | **Literature survey (Rubric A)** | The comparison table — §6 below. Landscape, readable | 2:00 |
| 5 | What the literature tells us | The three findings in §7 below. The 43-F1 finding is the centrepiece | 1:15 |
| 6 | **The research gap (Rubric B)** | The four-way intersection diagram, §8. Then the gap statement verbatim | 1:00 |
| 7 | **Problem statement (Rubric B)** | The statement in §9, plus 3–4 objectives | 0:45 |
| 8 | **System design (Rubric C)** | Block diagram, §10. Emphasise the proposed/approved boundary | 1:15 |
| 9 | **The pipeline (Rubric C)** | The 11-step algorithm compressed to 6 stages, §11 | 0:45 |
| 10 | **LIVE DEMO (Rubric D)** | Switch to the app. Script in §12 | 3:00 |
| 11 | **Results (Rubric D)** | Tables in §13 — extraction output and provider comparison | 1:00 |
| 12 | **Verification (Rubric D)** | 911 assertions, 0 failures, §13.3 | 0:30 |
| 13 | **What we have NOT measured** | §14. Do not skip this — see the note there | 0:45 |
| 14 | Progress vs. plan | Gantt: planned against actual, §15 | 0:45 |
| 15 | Individual contribution | Who did what, §16 — explicitly required by the guidelines | 0:30 |
| 16 | Remaining work | §17, priority-ordered | 0:30 |

## 5. The one strategic decision in this deck

**Lead with the difficulty of the problem, not with a promise of accuracy.**

Your synopsis contains precision targets of 92% / 90% / 85%. They were written before a single
lecture was processed. The strongest published result on the nearest comparable task is
**approximately 43 F1** — on clean English, with training data, after fifteen years of
research.

If you show 92% to a panel that knows this literature, the obvious question is "on what
basis?", and there is no good answer. If instead you show the 43, explain that your
architecture assumes extraction will be imperfect, and demonstrate the human approval gate
that follows from it, the same panel sees engineering judgement.

**Do not put the 92/90/85 targets in this deck.**

---

## 6. The literature comparison table (Rubric A — slide 4)

The guidelines require paragraph form in the report and **comparative form in the
presentation**. This is the comparative form. Twelve papers were reviewed; these seven fit on
a slide and cover all four areas. The full twelve are in the Interim Report, Table 2.1.

If it will not fit legibly, split across two slides by area — never shrink the type below
readable size.

| # | Paper | Area | Method | Key result | Gap it leaves |
|---|---|---|---|---|---|
| [1] | Diwan et al., 2021, **Interspeech** | Code-switched ASR | Baseline recipes, 600 h, 7 Indian languages | **WER 32.45%** on code-switched test set | Stops at the transcript |
| [2] | Jain & Bhowmick, 2024, **Applied Acoustics** | Code-switched ASR | VITB-HEBiC corpus, speakers from 27 states | **Whisper-medium WER 15.7%** | Read speech, not lecture speech |
| [12] | Agro et al., 2025, **Systematic review** | Code-switched ASR | Reviewed **127 papers**, 2018–2024 | Hindi–English is only **≈11%** of the field | Review only; confirms the area is under-served |
| [5] | Murray & Renals, 2008, **MLMI** | Commitment detection | Supervised classifier on AMI meetings | **AUROC 0.93 on ASR output at 38.9% WER** | English business meetings; but proves robustness to ASR error |
| [6] | Liu et al., 2023, **IEEE ICASSP** | Commitment detection | StructBERT + Context-Drop on AMI | **F1 38.67 → 43.12** | Best analogue result is only ≈43 — *with* training data |
| [8] | Parekh et al., 2025, **EMNLP** | LLM extraction | Zero-shot: Dreamer → Grounder → LLM-Judge | **+4–7% F1** over baselines | No educational domain, no speech |
| [11] | Li et al., 2025, **Computers & Education: AI** | Delivery | Systematic survey of RAG in education | Hallucination named as the key open challenge | Every system needs **faculty-uploaded documents** |

**Design note for Claude Design:** the last column is the one that matters — it converts a
list of summaries into an argument. Give it visual weight. Consider a right-hand accent rule
or a tinted column. The two numbers to make unmissable are **43.12** and **≈11%**.

## 7. What the literature tells us (slide 5)

Three findings. Keep to three.

1. **Transcription is a managed risk, not a blocker.** Code-switched WER improved from 32.45%
   [1] to 15.7% [2]. And Murray & Renals [5] show commitment detection holds at 0.93 AUROC
   over transcripts with **38.9% WER** — worse than anything we run on. *We do not need
   perfect transcription to start.*
2. **The extraction problem is genuinely hard, and the honest number is low.** ≈43 F1 [6] is
   the best published result on the nearest task, on easier input. *Our design must assume
   extraction will be imperfect.*
3. **Nobody has joined these literatures.** Speech research stops at the transcript. Meeting
   research works on English business meetings. Education research needs uploaded documents.

## 8. The research gap (slide 6)

**Diagram:** four overlapping circles — *Code-switched ASR* · *Commitment extraction* ·
*LLM / zero-shot IE* · *Educational delivery* — with the centre intersection empty and
labelled. Each circle carries its representative citation.

**Gap statement — use this wording exactly:**

> We found no published work that extracts structured academic commitments — assignments,
> deadlines, exam topics — from code-switched Hindi–English classroom speech, and no
> evaluation set exists for that task.

**Say "we found no published work", never "we are the first."** An absence of located evidence
is defensible. A priority claim needs only one counter-example to collapse, and a panel member
who knows one will use it.

## 9. Problem statement and objectives (slide 7)

> **How accurately can structured academic events — assignments, submission deadlines,
> examination topics and announcements — be extracted from code-switched Hindi–English
> classroom speech; and which combination of techniques, among pattern matching, named-entity
> recognition and LLM-based classification, yields the highest precision under realistic
> classroom conditions?**

**Objectives:**
1. Build a pipeline from lecture audio to structured, timestamped, verifiable academic events.
2. Guarantee that no unverified extraction reaches a student.
3. Compare extraction techniques over identical transcripts under a common interface.
4. Evaluate on 15+ annotated real lectures and report precision and recall honestly, including
   failure modes.

## 10. System design (Rubric C — slide 8)

**Diagram:** seven boxes left to right —
`Ingest → Transcription → Extraction → Knowledge Store → Review Queue → Retrieval & Q&A → Web`

**Draw one heavy vertical line between Review Queue and Retrieval.** Label it
**"the proposed / approved boundary"**, with the caption *nothing crosses without faculty
approval*. Make this the visual focus of the slide — it is the architectural argument.

Put dashed outlines around Transcription and Extraction labelled *swappable provider
interface*.

**The one sentence to say aloud:** "Because the literature says extraction will be imperfect,
we designed so that an extraction error becomes faculty review workload, never a wrong
deadline shown to a student."

## 11. The pipeline (slide 9)

Six stages:

1. **Upload** → audio to private storage, lecture row created
2. **Transcribe** → segments with millisecond timestamps
3. **Window** → transcript split into overlapping windows for the model's context limit
4. **Extract** → typed items, each required to return a **verbatim quote**
5. **Locate & verify** → quote located exactly in the transcript; **if it cannot be located,
   the item is discarded**
6. **Review** → faculty approve / reject; only approved items reach students

**Call out step 5.** It costs recall deliberately. A citation that lands on the wrong moment
teaches users that citations cannot be trusted, which destroys the only mechanism by which
the system can be checked. This is the kind of trade-off a panel rewards.

## 12. Live demo script (Rubric D — slide 10)

**Rehearse this end to end at least twice before the review.**

| Step | Action | Say |
|---|---|---|
| 1 | Faculty view, a course with a processed lecture | "This is a real recorded lecture, not a scripted one." |
| 2 | Open the lecture; show the transcript with Hinglish visible | "Note the code-switching — 'Transformation matrix. Theek hai?'" |
| 3 | Show extracted items, typed and categorised | "The system separates things you must *do* from things it *taught*." |
| 4 | Open a detected assignment; show the supporting quote | "Every item carries the exact sentence it came from." |
| 5 | **Click the citation — audio seeks to that moment** | "And it lands on the second it was said. This is the check that makes the system trustworthy." |
| 6 | Show the review queue; approve an item | "Nothing a student sees has skipped this step." |
| 7 | Switch to student view; ask a question in Ask | "The answer cites its source. If nothing relevant exists, it says so rather than guessing." |

**Contingency — prepare before the day:**
- Record a **screen capture of the full flow** and have it on the machine. If anything fails
  live, play it without apologising at length; say "I have a recording of this running, let me
  show you" and continue.
- Have **screenshots** as a second fallback, embedded in the deck at the end.
- Check whether the demo needs network access and whether the venue provides it. If it needs
  API keys, verify they are funded **before** you leave.

## 13. Results (Rubric D — slide 11)

### 13.1 Extraction output on two real lectures

| Lecture | Subject | Items | Evidence spans | Actionable | Teaching |
|---|---|---|---|---|---|
| A | Cloud infrastructure | 26 | 35 | 2 | 24 |
| B | Robotics — transformation matrices | 4 | 10 | 1 | 3 |

Say: both are genuine code-switched university lectures. Assignments **were** detected, each
with a verbatim quote and timestamp.

### 13.2 Provider comparison on an identical transcript

| Provider | Items | Evidence spans | Actionable |
|---|---|---|---|
| Provider 1 (Sarvam) | 24 | 28 | 1 |
| Provider 2 (Gemini) | 26 | 35 | 2 |

**Say this explicitly:** "Without ground truth this shows a difference, not a superiority — a
higher count is equally consistent with better recall or with over-extraction. What it *does*
prove is that our provider abstraction works, which is what makes the technique comparison in
our problem statement possible."

That sentence is worth marks. It shows you understand what your own data does and does not
support.

### 13.3 Verification (slide 12)

| | |
|---|---|
| Functional suites (12, offline) | **766 assertions, 0 failures** |
| Authenticated security testing | **145 assertions, 0 failures** |
| **Total** | **911 assertions, 0 failures** |
| TypeScript, ESLint, production build | Clean |

Security testing covered cross-user isolation, role escalation, resource authorisation,
row-level security under real user tokens and forged tokens — run against a production build
with API keys blanked so no request could incur spend.

## 14. What we have not measured (slide 13)

**Do not cut this slide.** Volunteering your limitations before the panel finds them converts
an attack into a demonstration of rigour. It also directly serves Rubric E, which asks for
technical requirements and future extensions to be specified.

- **No precision/recall figure yet** — no annotated ground truth exists. Building a
  15-lecture annotated corpus is the largest remaining task.
- **Deadline resolution not implemented** — assignments are detected, due dates are not
  resolved to absolute times. SUTIME [10] reaches 0.92 F1 at *locating* a time expression but
  only **0.82** at resolving its value — on written English news with a known document date.
  Spoken, relative, code-switched deadlines are strictly harder. We render no date rather than
  render a fabricated one.
- **Only the LLM path is implemented** — pattern-matching and NER baselines are an interface
  contract, not yet code.
- **Two lectures, two subjects** — nothing established about generalisation.

## 15. Progress vs. plan (slide 14)

**Required by the guidelines:** "The current progress would be compared with the project
engagement schedule and the project development plan, which was submitted during the 1st
Review."

Build a Gantt with **two bars per task** — planned and actual. Do not present a fresh plan as
though the original did not exist; the panel is checking against what you committed to.

`[FILL FROM YOUR REVIEW 1 GANTT CHART. If a task slipped, show it slipped and say why in one
sentence. A visible, explained slip reads far better than a chart that has been quietly
rewritten to match reality.]`

Honest framing available to you: *the engineering is ahead of schedule; the evaluation is
behind.* That is an unusual and defensible position, and it is true.

## 16. Individual contribution (slide 15)

**Explicitly required:** "Individual contribution to be presented."

| Member | Area owned | Specific contribution this phase |
|---|---|---|
| `[NAME 1]` | `[e.g. pipeline & extraction]` | `[ ]` |
| `[NAME 2]` | `[e.g. interfaces & review queue]` | `[ ]` |
| `[NAME 3]` | `[e.g. literature survey & evaluation design]` | `[ ]` |

Be specific. "Worked on backend" earns nothing; "implemented the evidence-span locator and the
discard-on-failure rule" earns attention.

## 17. Remaining work (slide 16)

Priority order:

1. **Annotated evaluation corpus** — 15+ real lectures, hand-annotated. Everything
   quantitative depends on it; longest lead time because it needs institutional permission.
2. **Consent and data-protection position** under the DPDP Act, 2023 — classroom audio
   captures students, not only the lecturer.
3. **Measure precision and recall**, per category, with failure analysis.
4. **Implement the comparison baselines** and run all three over identical transcripts.
5. **Deadline resolution**, informed by HeidelTime [9] and SUTIME [10].
6. **Research paper** — Review 3 carries up to 10 marks for a Scopus-indexed submission with
   plagiarism, including AI similarity, under 10%.

---

## 18. Questions to expect, and the answers

| Question | Answer |
|---|---|
| "Your accuracy?" | "We have no precision figure yet, because we have no annotated ground truth — building that corpus is our next task. What we can show is that the system extracts assignments from real code-switched lectures with verifiable citations. For context, the best published result on the nearest comparable task is about 43 F1, on easier input with training data." |
| "Why not just use ChatGPT / Otter?" | "Those produce summaries. We produce typed records with a verbatim quote and a timestamp for each, verified against the transcript, gated behind faculty approval. And generic tools cannot separate an obligation from a suggestion — that distinction is the product." |
| "How do you know it isn't hallucinating?" | "Every item must return a verbatim quote that we then locate in the transcript. If we cannot locate it exactly, we discard the item. You can click any claim and hear it." |
| "What if the transcription is wrong?" | "Murray and Renals showed commitment detection holds at 0.93 AUROC over transcripts with 38.9% word error rate — worse than ours. Transcription quality is a risk we measure, not a gate we must clear first." |
| "Is this novel?" | "We found no published work extracting academic commitments from code-switched classroom speech. We state it as absence of found evidence rather than a priority claim." |
| "What about student privacy?" | "Classroom audio captures students, not only the lecturer, and the DPDP Act 2023 applies. We have no consent position yet, and we have it as item 2 of our remaining work — it must be settled before we record at scale." |
| "Only two lectures?" | "Yes — which is why we make no generalisation claim. The 15-lecture corpus is the next milestone." |

---

## 19. Design direction for Claude Design

- **Data-dense but calm.** The panel reads rubric rows; make the five rubric sections visually
  distinguishable, perhaps by a section divider or a consistent corner label.
- **Tables must be legible from the back of a room.** If a table will not fit, split it — never
  reduce the type size.
- **Three numbers carry this deck: 43.12, ≈11%, and 911.** Treat them as display type.
- **The block diagram (slide 8) is the single most important visual.** The proposed/approved
  boundary should be the first thing the eye finds.
- **Restraint.** No stock imagery, no gradients for their own sake. This is engineering work
  presented to engineers.
- **One idea per slide.** If a slide needs two sentences of explanation, it is two slides.
- **Dark or light is your call, but fix it once** and keep the code-switched Devanagari
  rendering correctly — check the font actually supports it before finalising.
