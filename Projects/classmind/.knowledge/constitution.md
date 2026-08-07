---
status: Draft
created: 2026-07-29
updated: 2026-07-29
---

# The ClassMind Engineering Constitution

Nine articles. Every future architectural decision must obey them, and any decision that
violates one requires a written entry in `decisions.md` explaining why.

Produced by a three-member founding engineering council on 2026-07-29 — see
`sessions/2026-07-29-council-architecture-philosophy.md` for the disagreements behind it.

**Terminology note (2026-07-29):** [domain-model.md](domain-model.md) is the authority for
what words mean. The articles below were written before it and use two informal terms that
now have precise names — where an article says *"proposal"* read **Observation**, and where it
says *"event"* read **Ledger Item** (a Commitment, Notice, or Guidance). The articles were
otherwise checked against the domain model article by article and no contradiction was found;
the one genuine tension, between Article I's erasure right and Article II's append-only rule,
is resolved in the domain model's Challenge 10.

**Scope note (2026-07-30):** these articles bind ClassMind's two platforms differently. The
production-data articles (I, II, III, V, VI) bind the **Product Platform**. The
research-validity articles (IV, VII, VIII, IX) bind the disposable **Experiment Platform** as
well, because they protect the graded research claims. Article 0 is why the split is safe: the
experiment's *code* is disposable, its *evidence* is not. Full rationale in the 2026-07-30
platform-separation entry in `decisions.md`.

**Ordered by cost of violation, most expensive first.** Each article states what a violating
change looks like, what obeying it costs, and whether it may be suspended. An article whose
cost you cannot name is one nobody has thought about.

---

## Article 0 — The rule that generated the rest

> **Code is cheap. Data semantics are not. Unrecorded state is not recoverable at any price.**

Every article below is a consequence of this one. The founder's instinct — *"the question is
never can this architecture survive forever, but when requirements change, how much must
change?"* — is right about the goal and wrong about where the danger lives.

The danger is not in the code. This system will be roughly 4,000–6,000 lines at capstone.
Rewriting all of it, with AI assistance, on a codebase you understand, is a matter of days.
Paying a daily tax in indirection to insure against a one-week event is negative value.

The danger is in the *meaning of accumulated data*. If `confidence` means one thing for the
first eighty lectures and something else afterwards, no interface saves you. If approving an
event overwrites what the model originally proposed, the label is gone and no refactor brings
it back. If a spoken date phrase was normalised and the original discarded, every future
improvement to date parsing can only be applied going forward, never to history.

So the operational form of the founder's thesis is not "build seams." It is:

> **Localize change along axes you have named in writing. Everywhere else, prefer deletable
> code over flexible code. And make every derived thing reconstructible by one command.**

That last clause is the testable part. You can literally run the rebuild and see whether it
works. "Optimize for localized change" forbids nothing and therefore constrains nothing.

---

## Article I — Consent is a precondition, not a feature

No raw artefact exists in the system without a traceable consent record. Every artefact is
deletable per subject, on request, including everything derived from it.

The consent language must be drafted **broad and honest at the outset** — covering service
delivery, research publication, and model improvement — because under DPDP 2023 purpose
limitation, consent obtained for one purpose does not extend to another, and you cannot
re-consent students who have graduated.

**Violation looks like:** a migration creating a table of audio, transcript, or identifiable
speech with no path to the consent that authorises it. A deletion routine leaving orphaned
derived rows. Any row anywhere without an institution scope.

**Cost:** slower to start against real data; the deletion cascade must be designed before it
is first used; and you must tell faculty plainly that their corrections are retained, which
will make some correct less honestly and some refuse outright.

**Suspendable:** never. This is the only article whose violation ends the project rather than
costing time.

---

## Article II — Every table is classified raw, derived, or authored

- **Raw** — the audio, the ASR output exactly as returned, the human action log. Append-only.
  No `UPDATE`, ever. Removable only through Article I.
- **Derived** — computed from raw by a stated procedure. Never hand-edited. Droppable and
  rebuildable at any time.
- **Authored** — a human deliberately created it. Editable, but every edit is itself an
  append-only raw event.

**The test that makes this real: every derived table must be droppable and rebuildable by one
documented command.** If you cannot drop and rebuild it, some derived data has quietly become
authoritative and you have lost the property that makes rewrites cheap.

**Violation looks like:** a migration adding a table without declaring its class. An `UPDATE`
against a raw table. A derived field written from a UI form. A script that "just fixes" a
transcript in place.

**Cost:** storage growth; you can never fix a typo in place; every reader resolves "the
current version of X" rather than reading X; more joins; slower to demo.

**Suspendable:** never. Violations here are unrecoverable by construction.

---

## Article III — Nothing reaches a student without a human verdict

There must be no code path by which unattested content reaches a student. Not behind a flag,
not with a warning, not in a debug view.

**Credit where it belongs:** this is a *safety invariant* justified by asymmetric failure
cost — a missed assignment is an inconvenience, a confidently wrong deadline is a failed
submission. It is not a change-localization device, and it would be correct in a system whose
code never changed again. Do not let it be cited as evidence for seams elsewhere.

**Violation looks like:** a student-facing query not filtered on attestation. A confidence
threshold used as a substitute for a human. An admin route rendering proposals to a
non-faculty role.

**Cost:** a permanent throughput ceiling — product value is capped by faculty attention, a
lecture with an unresponsive lecturer produces nothing, and there is no cold-start value for
a new college.

**Suspendable:** never.

---

## Article IV — Provenance is a required field, not metadata

Every claim carries: a resolvable pointer to the raw artefact it came from; the identity of
what produced it (human identity, or **model id + dated snapshot + prompt version + decoding
parameters + code commit**); and its **kind** — verbatim, human-corrected, or human-authored.

Two specifics that are easy to miss and impossible to backfill:

- **Pin dated model snapshots, never floating aliases.** A bare model name can change
  underneath you server-side. Without the snapshot recorded, you can never distinguish "our
  prompt got worse" from "the vendor upgraded the model."
- **Store the spoken date phrase alongside the resolved date**, plus the utterance timestamp,
  assumed timezone, and resolution rule. Store only `due_at` and every date-parsing bug
  becomes permanently unfixable retroactively. Three columns. Highest value per line in the
  entire system.

**Violation looks like:** an extraction stored without its model and prompt version. An event
whose text was edited while its source pointer and kind stayed unchanged. A student-visible
field with no source.

**Cost:** every write path widens; four to six provenance columns per table; the review UI
must render provenance, competing with the five-minute budget; prompt-hash discipline slows
the fast "tweak and re-run" loop.

**Suspendable:** never. Provenance cannot be backfilled.

---

## Article V — Human decisions are append-only; state is folded from the log

The proposal and the verdict both survive, forever, separately. Approving an event does not
mutate the proposal — it appends an attestation. The current state of any commitment is
*derived* by folding its ordered attestations.

This kills a specific bug already latent in `architecture.md`: a mutable
`status: proposed | approved | rejected | superseded` column destroys the record of what the
model actually said, which is half of every training label and the entire audit trail.

**Consequence worth stating on its own:** when faculty change a due date, they do not edit
the due date. They make an attestation, and the due date is recomputed. This is the
difference between *"the deadline is Monday because Professor X said so on 12 Nov, here is
the audio"* and *"the deadline is Monday and nobody can say why."*

**Violation looks like:** an `UPDATE` on an event's status. A boolean `approved` column. Any
design where the approved value overwrites the proposed one.

**Cost:** more rows, more folding logic, a slower first implementation, and reads that are
never a single `SELECT`.

**Suspendable:** never — this is the article the correction corpus and the audit trail both
depend on.

---

## Article VI — A seam requires a named second implementation, an owner, and a date

Before building any abstraction, name three things: (a) the specific second implementation,
(b) who will build it, (c) when. If you cannot fill all three, write the concrete thing.

Applied to the current design, this is not theoretical — it already cuts:

| Seam | Second implementation | Verdict |
|---|---|---|
| LLM provider module | On-premise, post-capstone milestone | **Keep** |
| ASR interface | Whisper, week 2, required by roadmap | **Keep** |
| `extract()` interface | Three graded comparison arms, Phase 2, required by rubric | **Keep, but reshape** |
| Search behind an interface (pgvector→FAISS) | None. Justified by a scale we may never reach | **Cut** |

Three of four survive — and each survivor was justified by a concrete committed requirement,
not by the philosophy. Note also that the surviving seams stop being "a mild violation of
`PRINCIPLES.md` #2" and become straightforwardly correct: **abstract on the third occurrence,
or on a named axis — never on a hunch.**

The named axes for this project are: LLM provider swap; ASR provider swap; extraction method
swap; a second institution; a second language pair. **Nothing not on that list gets a seam.**

**Violation looks like:** an interface with exactly one implementation and no named axis. An
abstraction layer over a vendor we have openly married (Postgres, Supabase Auth, Next.js).

**Cost:** you will occasionally write the concrete thing and have to change it later. That is
the bet, and at this codebase size it is a good one.

**Suspendable:** the axis list may be extended in writing. The requirement to name one may not
be waived.

---

## Article VII — Every reported number is regenerable by one command

Each evaluation run records: dataset version, prompt version, model id + snapshot, method,
per-class precision/recall/F1, cost, latency, timestamp, and code commit. Raw predictions are
kept as flat JSONL per run — aggregate metrics alone cannot support an error analysis, and
raw outputs can be impossible to regenerate once a model is deprecated.

No MLflow, no Weights & Biases. One flat table and a directory of JSONL files. Those tools
solve problems of many concurrent experimenters and hyperparameter sweeps; you will run well
under a thousand evaluations.

**Violation looks like:** a precision figure whose provenance is "we ran the notebook." A
dataset split existing only on one laptop. An evaluation run against a prompt since edited
without a version bump.

**Cost:** real upfront work before it pays anything back, and it forbids the fastest possible
way to get a number at 1am before a review.

**Suspendable:** yes, until the first number is shown to anyone outside the team. Never after.

---

## Article VIII — Evaluation ground truth is quarantined from product data

Two label sets, never merged:

- **The graded set** — small, double-annotated, blind, held out, frozen with a committed
  manifest of file hashes, annotator IDs, freeze date and measured κ. Every reported number
  is computed against this and nothing else.
- **The product set** — the large, fast, single-annotator faculty correction corpus.
  Legitimate for few-shot exemplars, regression testing, and future fine-tuning. Never for a
  reported metric.

Few-shot examples in production prompts come only from the dev set or synthetic data — never
from the frozen test set. This is the easiest contamination to introduce by accident.

**Why this is an article and not a footnote:** faculty review is, by deliberate design, a bad
ground-truth instrument. It is single-annotator, so no κ is computable. It is not blind — the
reviewer sees the model's answer first and is anchored by it. It is speed-optimised under a
five-minute budget that actively discourages careful adjudication. And recall is structurally
unmeasurable from it, because faculty only react to what the system proposed. All of that is
*fine* — it is optimised for trust and speed, which is the right thing — but it cannot be the
instrument that grades the model.

**Violation looks like:** computing a reported metric from correction data. A test-set example
appearing in a prompt. Any schema where eval labels and product corrections are distinguished
only by a column value.

**Cost:** you must actually recruit and train annotators and pay the hours. The evaluation
dataset is not free, and any plan that assumed it was has a hole in the schedule.

**Suspendable:** never. This is the article that determines whether the graded contribution
survives scrutiny.

---

## Article IX — Anything named "confidence" is calibrated, or it is renamed

If a number is presented as a probability, there must be a measured calibration curve. If
there is not, it is called `review_priority`, not `confidence`.

LLM self-reported confidence — which is what the synopsis's Appendix D prompts ask for — is
known to correlate weakly with correctness, cluster on round numbers, and respond to surface
phrasing rather than genuine uncertainty. It is also not comparable across model families,
so a threshold tuned on one model is meaningless on another.

This matters because the number is load-bearing twice: it sorts the review queue, which is
what makes the five-minute budget achievable, and "document confidence scoring effectiveness"
is a **stated research objective**. You cannot document the effectiveness of a quantity whose
meaning you have not defined.

**Violation looks like:** shipping a self-reported score in a field called `confidence`.
Reporting on calibration without a reliability diagram. Downstream code treating it as a
probability.

**Cost:** calibration needs labelled data that will not exist until Phase 2, so you will ship
a renamed field and possibly rename it back later. Honest calibration may also reveal your
review ordering is close to random, which you would then have to report.

**Suspendable:** the calibration may be deferred. The naming may not — renaming is free today
and expensive once the field is in the schema, the UI, the paper, and eighty lectures of data.

---

## The suspension meta-rule

> **An article may be suspended only if the violation is reversible using data you will still
> have afterwards.**

That is the whole test, and it is why Articles I–V and VIII are permanent while VI, VII and
IX are conditionally suspendable. Every permanent article fails by destroying or never
capturing something that cannot be recreated. This is
[Principle 8](../../../AI-Memory/01_Principles/PRINCIPLES.md) — reversibility over
correctness — applied to the constitution itself.

A suspension requires an entry in `decisions.md` with an **expiry condition**. A suspension
with no expiry condition is a repeal.

---

## Principles considered and rejected

Recorded so they are not re-proposed later.

**"Every dependency should have a single owner."** Two readings, both fail. Organisationally,
at three people all learning simultaneously, assigning one person a dependency does not mean
they understand it — it means nobody else reads that code, and the bus factor gets worse.
Architecturally, it is already Article VI in different words.

**"Modules should communicate through contracts rather than implementation details."** This is
a restatement of encapsulation that every engineer believes they already follow. Test it:
*should the review queue read the segments table directly to show context around a candidate?*
The principle gives no answer. It forbids nothing. For a team that has never felt a boundary
go wrong, elevating generic modularity to constitutional status produces seams placed by
guesswork — and when the real change arrives it cuts across all of them, so you pay the
abstraction tax *and* the rewrite. One boundary you actually enforce (Article III) beats ten
you nominally believe in.

**"Knowledge should be treated as the product rather than transcripts."** True as positioning,
useless as engineering — it forbids nothing in a code review. The enforceable version is
Article V (the proposal↔attestation pair survives) plus Article VIII (but it is not your
evaluation set). See the session log for why the *moat* framing of this claim did not survive
the council's arithmetic.
