# Decisions — ClassMind

Project-scoped choices. Newest at the top.

If a decision here would apply to a future unrelated project, it belongs in
`AI-Memory/07_Decisions/` instead — say "Promote this" to move it.

The **six 2026-07-29 decisions** were taken together, before any code existed. Each deviates
from `research/2026-07-24-synopsis-full.md`. The synopsis is not wrong so much as written
before we had to build it — these are the corrections that come from planning the build rather
than describing it. The **2026-07-30 platform-separation decision** is separate and later; it is
a development-strategy choice, not a synopsis deviation. The **four 2026-08-07 decisions** are
later still and are the first taken with code in existence — they record what Lab v0 is actually
built on. They were *made* on 2026-08-07, as the code shows, but lived only in commit messages and
source comments until a documentation reconciliation **recorded them here on 2026-08-11**; they
are dated when they were made, not when they were written down. The **2026-08-11 decision** at the
top was taken during that reconciliation, when the audit found that Lab v0's stated justification
was false.

Older entries are never rewritten to match newer ones. Where a later decision changes an
earlier one's scope, the earlier entry keeps its original text and gains a dated scope note.

**If the synopsis has already been formally submitted and graded, these deviations need to be
explained to the guide, not hidden.** A capstone that says "we changed approach X for reason
Y and here is the evidence" reads as engineering maturity. A capstone that quietly ships
something different from its synopsis reads as scope drift.

---

## 2026-08-07 — Build Lab v0 by choice, not because the walkthrough requires it

**Decision:** We are building Lab v0 as Experiment Platform infrastructure, deliberately, while
the frozen walkthrough remains unrun. Three things are distinguished and must not be conflated:

1. **What the frozen protocol requires.** Nothing from us. [walkthrough-protocol.md](walkthrough-protocol.md)
   step 2 says transcribe "with whatever ASR is nearest to hand; record engine and version" — one
   person, twenty minutes — and step 8 the same for lectures 2–4. Any suitable ASR satisfies it.
   **The walkthrough has never been blocked on software, and Lab v0 does not unblock it.**
2. **What we chose to build anyway.** Lab v0 is our own infrastructure for making transcription
   **repeatable, measurable, reproducible, and practical against real classroom recordings** —
   uploads that survive a browser refresh, provenance recorded at write time rather than
   retrofitted, and a transcript any of the three of us can regenerate from a stored artefact. A
   one-off manual transcription satisfies the protocol; it does not survive being asked "what
   exactly produced this number?"
3. **What it will eventually produce.** Evidence about transcription: error rate on
   obligation-bearing sentences specifically (walkthrough criterion C4, and prediction P10),
   wall-clock cost per lecture, and vendor cost. **Nothing about the domain model.**

**Building Lab v0 validates no concept, and does not replace or partially discharge the
walkthrough.** The gate is unchanged: nothing naming Commitment, Notice, Guidance or an
annotation unit is built until the walkthrough's results document exists. Lab v0 sits on the near
side of that line — it handles bytes and provenance, which is the boundary two of the three
2026-07-30 council reviewers drew independently ([lab/README.md](../lab/README.md)).

**Reason:** [walkthrough-protocol.md](walkthrough-protocol.md) § Stopping rule says "nothing
downstream — product architecture, navigation index, schema, dashboards, implementation — begins
until the results document exists," and Lab v0 has built a schema and an implementation. Read
literally, that sentence has been crossed. It is recorded here rather than resolved by editing
the protocol: the protocol is frozen precisely so that reality is not retrofitted onto
predictions, and its own preamble instructs that design defects be recorded elsewhere and changed
for the *next* run. The substantive defence is that the stopping rule guards the **domain model**
from premature encoding, and `runs` encodes no domain concept — deliberately, with a guardrail
comment in the migration and no foreign key to any course concept.

Independently, criterion C4 and prediction P10 both concern ASR adequacy, and neither can be
answered credibly by one hand-run transcription with no recorded provenance. Constitution VII
requires every reported number to be regenerable by one command; a manual transcript cannot
satisfy that.

**Alternatives Considered:**
- *Run the walkthrough first, build nothing.* The orthodox reading of both the roadmap and the
  2026-07-30 decision, and the cheaper path. Not rejected on merit — the walkthrough is still the
  next real milestone and is still unrun. Rejected only as an *exclusive* choice: the walkthrough
  depends on two people having one uninterrupted day, and blocking all engineering on that
  scheduling constraint wastes the interval.
- *Declare Lab v0 a walkthrough dependency.* What `README.md` previously claimed. **Rejected as
  false** — the protocol asks for any ASR in twenty minutes. Keeping the claim would have
  justified the build with a fabricated requirement, which is worse than an honest choice.
- *Amend the stopping rule.* Rejected. The protocol is frozen; amending it to fit what we already
  did is the failure it exists to prevent.

**Trade-offs:**
- Engineering time spent before the gate that could have gone to running the walkthrough. Real,
  accepted, and the walkthrough's continued delay is the cost to watch.
- **The failure mode to watch:** Lab v0 becoming the reason the walkthrough keeps slipping. If the
  next session again ends with Lab progress and no walkthrough date, that is this decision going
  wrong, and the answer is to stop building and book the day.
- We are on record as having crossed a frozen document's stopping rule on an interpretation. Shiv
  and Darsh may disagree, and this entry exists so they can.
- **This decision is void the moment Lab code names a domain concept.** That is the gate, not this
  entry.

---

## 2026-08-07 — Lab v0 stack: Next.js + TypeScript + Tailwind + Supabase + Sarvam

**Decision:** Lab v0 runs on Next.js 16.3 + TypeScript + Tailwind 4, with Supabase for Postgres
and Storage, and Sarvam for speech-to-text. **Technology is shared with the intended Product
Platform; architecture is not.**

**Reason:** Constitution Article VI already names Postgres, Supabase Auth and Next.js as vendors
this project has openly married, so this confirms an existing commitment rather than opening a
new one. One language for the Lab (TypeScript) rather than the Product Platform's planned
Python/TypeScript split, because the Lab does no ML work — it moves bytes. Supabase supplies
Postgres, object storage and signed upload URLs from a single managed vendor, which matters for a
three-person learning team ([project.md](project.md) § Team context) and satisfies the standing
no-Docker constraint. Sarvam was already [architecture.md](architecture.md)'s primary ASR choice,
selected for Indian code-switching.

**Alternatives Considered:**
- *Python/FastAPI, to match [architecture.md](architecture.md)'s Product Platform design.*
  Rejected for the Lab: there is no ML work here, and a second runtime doubles what can break for
  no benefit. That document is Product-scoped and is reconciled at Stage C, not now.
- *Local filesystem and JSONL only* — the previous constraint. See the reversal entry below.
- *Whisper locally as primary* — retained instead as the Article VI named second implementation
  for the ASR seam, not the primary path.

**Trade-offs:**
- Sharing technology with the Product Platform makes it easier for the Lab to quietly *become* the
  product — the failure mode the 2026-07-30 decision named. The guards are unchanged: no auth, no
  dashboards, no domain-concept naming, `product/` stays empty.
- External vendor dependency on Sarvam, whose secondary-use terms are still unread and still block
  the first upload.

---

## 2026-08-07 — Lab v0 may use a database and an HTTP API (reverses the earlier constraint)

**Decision:** The Lab's standing constraint "No database, no HTTP API, no auth, no embeddings —
JSONL and files (Constitution VII)" is **narrowed to "no auth, no embeddings."** The database and
HTTP-API prohibitions are withdrawn.

**Reason:** The constraint's stated authority does not support it. Constitution Article VII
governs **evaluation-run records** — it prescribes "one flat table and a directory of JSONL
files," and rejects MLflow and Weights & Biases on the stated ground that they solve problems of
many concurrent experimenters and hyperparameter sweeps. It says nothing about where an
application's operational data lives, and nothing whatsoever about HTTP APIs. Reading a sentence
that prescribes *one flat table* as a prohibition on tables inverted it. Article VI independently
names Postgres and Next.js as married vendors.

**This is the correction of a misreading, not a constitutional deviation**, and it therefore needs
no suspension under the Constitution's meta-rule. The Constitution is unchanged and requires no
change. The auth and embeddings prohibitions are unaffected and remain in force as disposability
guards.

**Alternatives Considered:**
- *Keep the constraint and build on JSONL.* Rejected: resumable async job state (see the entry
  below) held in flat files means hand-rolling atomic writes and locking, which is more machinery
  than a table, not less.
- *Amend Article VII to permit this.* Rejected — the article is correct as written; the citation
  was wrong.

**Trade-offs:**
- A schema is more attractive to keep than a directory of files, which pulls toward the
  "experiment becomes the product" failure mode. Mitigations: the migration's guardrail comment,
  no domain-concept naming, no auth, and `product/` empty by design.
- Anything already written against the old constraint has to be corrected rather than quietly
  contradicted — which is what the 2026-08-07 documentation pass did.

---

## 2026-08-07 — Sarvam's Batch API is async; a run models a job, not a request

**Decision:** Transcription is an asynchronous job, not a request. Sarvam's Batch API is used
rather than the synchronous endpoint, and the `runs` lifecycle models a job accordingly:
`pending_upload → uploaded → transcribing → completed | failed`, where `transcribing` means a
provider job is in flight. `provider_job_id` is persisted at submission time and is the entire
resume mechanism — the row already carries everything a poll needs, so no separate resume path
exists. `provider_status` mirrors the provider's raw last-polled status string for debugging and
audit only; **application code never branches on it.** At the boundary, provider-specific states
collapse to `in_progress / completed / failed`, so a future provider's vocabulary never has to
match Sarvam's.

**Reason:** The synchronous endpoint caps at thirty seconds and a lecture is forty minutes, so the
async path is not a preference. Once transcription is a job rather than a request, resumability
across a page refresh or a restart has to be designed in rather than added: without a persisted
job id, a closed browser tab orphans a paid transcription with no way to reclaim it.

**Alternatives Considered:**
- *Synchronous endpoint with chunking.* Rejected: it builds a chunker before measuring whether one
  is needed, which [v0-ingestion/README.md](../lab/v0-ingestion/README.md) explicitly forbids.
- *In-memory job tracking.* Rejected: does not survive a restart, which is the only failure this
  mechanism exists to handle.
- *Branching application logic on the provider's own status strings.* Rejected: it welds Sarvam's
  vocabulary into the app and defeats the ASR seam Article VI approved.

**Trade-offs:**
- Polling infrastructure that a synchronous call would not need.
- Latency is now the provider's queue plus transcription, and is not knowable until measured —
  which is one of the numbers Lab v0 exists to produce.

---

## 2026-08-07 — Course Context stays outside Lab v0

**Decision:** The `runs` table carries no foreign key to any course, session, offering or lecture
concept, and none is to be added speculatively. Lab v0 handles one audio file at a time, with no
notion of which course it belongs to.

**Reason:** The real domain model links Course Offering → Session → Recording, not directly to a
transcription run — so **which table a future foreign key should target is exactly what the
walkthrough is meant to settle, and is not this schema's to guess.** Adding the column now would
encode an unvalidated domain relationship into the first migration, which is the specific failure
the platform split and the walkthrough gate both exist to prevent.

**Alternatives Considered:**
- *Add a nullable `course_id` now, "just in case."* Rejected: a speculative FK is a domain
  assertion wearing a convenience's clothes, and the cost of adding it later is one additive
  nullable column — the cheapest migration there is.

**Trade-offs:**
- Runs cannot be grouped or filtered by course. Acceptable at v0 volume, where the expected corpus
  is four lectures.
- Someone will eventually want this and must resist adding it until the walkthrough has run. The
  migration carries a guardrail comment saying so.

---

## 2026-07-30 — Separate the Experiment Platform from the Product Platform

**Decision:** ClassMind is built as two distinct systems, not one that evolves into the other.

- **The Experiment Platform** exists only to generate evidence and validate the domain model.
  It contains the minimum needed to run experiments: audio in, storage, speech-to-text,
  transcript storage, LLM extraction, a bare attestation/review screen, export. No auth, no
  student or faculty dashboards, no analytics, no notifications, no production architecture.
  It is **disposable** — if the evidence invalidates the domain model, we rebuild it without
  regret.
- **The Product Platform** is the production system colleges use. Its architecture, schema,
  dashboards, APIs and backend are designed *only after* the concepts are validated, and are
  informed by the evidence the Experiment Platform produced.

The pipeline is **Experiment Platform → Evidence → Validated Concepts → Product Platform.**
Each arrow is a gate: the next stage does not begin until the previous one has produced its
output.

**Two clarifications without which this decision is dangerous:**

1. **Disposable in code, not in evidence.** The Experiment Platform's *software* is throwaway.
   The *evidence it produces* — the numbers, and the provenance of those numbers — is the
   capstone contribution and is not throwaway. So the Constitution splits by platform rather
   than exempting the experiment wholesale: the production-data articles (I consent,
   II raw/derived, III human checkpoint, V append-only, VI seams) bind the **Product
   Platform** and do not burden the disposable experiment; the research-validity articles
   (IV provenance, VII regenerable numbers, VIII eval quarantine, IX confidence naming) bind
   the **Experiment Platform too**, because they protect the graded claims. A "disposable"
   platform that emits unreproducible numbers has thrown away the one thing it existed to
   make. Correspondingly, the Capture Contract binds the Product Platform; the Experiment
   Platform's only capture obligation is that its evidence be reproducible (Article VII), not
   production-grade consent, tenancy, or audit.

2. **The first walkthrough needs no Experiment Platform at all.** The immediate next step —
   the frozen [walkthrough-protocol.md](walkthrough-protocol.md) — is manual annotation by two
   people over public lecture transcripts. Zero software. The Experiment Platform earns its
   existence only for the *volume* experiments that come after the manual walkthrough shows the
   concepts are legible enough to automate — running extraction across many lectures to produce
   precision/recall numbers. Building the Experiment Platform before the manual walkthrough
   would repeat the mistake this project already made once with BuilderOS: infrastructure built
   ahead of the thing it exists to serve.

**Reason:** We were treating one system as if it had one purpose, when it has two that pull in
opposite directions. A research spike wants to be quick, throwaway, and free to be wrong. A
product wants to be durable, careful, and correct. Force both roles onto one codebase and
either the spike inherits production ceremony it does not need — slowing the research — or the
product inherits the spike's shortcuts and fossilises unvalidated assumptions into its schema.
The walkthrough exists precisely to test whether the domain model is right; building the
product on that model *before* the test would harden into the schema exactly the assumptions
the test might overturn.

**Alternatives Considered:**
- *One codebase that grows from spike into product.* The common path, and the one that feels
  efficient. Rejected because "temporary becomes permanent" is the default outcome, not the
  exception — the spike's early shortcuts become load-bearing before anyone consciously decides
  to productionise. Article 0 says code is cheap, which means throwing the experiment away is
  cheap; it is *keeping* it that costs.
- *Two platforms sharing one schema.* Rejected: the shared schema is exactly the thing the
  walkthrough might invalidate, so sharing it defeats the disposability that is the whole point.
- *No Experiment Platform; go straight to the Product Platform after the manual walkthrough.*
  Not rejected — **held.** If the manual walkthrough answers enough and the volume experiments
  turn out unnecessary, skip the Experiment Platform entirely. Decide that after the walkthrough,
  on evidence, not now.

**Trade-offs:**
- Two codebases eventually exist, and throwaway work is real work. Accepted: the throwaway is
  cheap (Article 0), and the alternative — fossilised assumptions — is expensive.
- **The failure mode to watch:** the Experiment Platform quietly becoming the product because
  it "already works." The guards are that it is named disposable in writing, that it
  deliberately omits auth, tenancy and dashboards so it *cannot* be shipped, and that the
  Product Platform gets its own architecture pass. If anyone proposes "let's just add auth to
  the experiment platform and ship it," that is this failure mode arriving, and the answer is no.
- Discipline is required to actually throw it away. The name and the missing production concerns
  are the enforcement, not good intentions.

**Scope (noted 2026-08-07):** clarification 2 above says the Experiment Platform "earns its
existence only for the *volume* experiments that come after the manual walkthrough." That is no
longer what we are doing, and the entry is left unedited so the change is visible rather than
silent. Lab v0 is being built **before** the walkthrough, as a deliberate choice recorded in the
2026-08-07 build-by-choice entry at the top of this file. Everything else here still holds: the
platform split, the disposability of the code, the non-disposability of the evidence, the
Constitution's split by platform, and the named failure mode. **The gate is unchanged** — Lab v0
handles bytes and provenance only, and validates nothing about the domain model.

---

## 2026-07-29 — Capture every faculty correction as labelled data

**Decision:** Every faculty approve / edit / reject action is stored permanently as a
labelled example: the transcript span, what the system extracted, what the faculty changed it
to, and who changed it. This is built into the schema from the first migration, not added
later.

**Reason:** The extraction prompt will be matched by anyone within months — prompts are not
defensible. The corpus is our evaluation dataset for regression testing, our source of
few-shot exemplars, and our error taxonomy. Capturing it costs one table and a write path,
which is cheap enough that it needs no further justification.

**REVISED 2026-07-29 — the original reason called this "the only component of ClassMind that
compounds" and treated it as the company's moat. The council's arithmetic does not support
that and the claim has been withdrawn.** A one-hour lecture yields roughly 3–8 events. The
capstone produces 100–160 labels total; one college over a full semester produces about
1,500/year; thirty colleges over two years produce perhaps 90,000. For a four-class
classification task with one binary flag and a date parse, that is a few thousand dollars of
vendor annotation, not a defensible asset — and a large fraction are near-duplicates. Growth
is *linear in faculty review hours*, the scarcest and least willing input in the system,
which is the opposite of compounding.

The real defensibility is, in order: being the system of record that students plan around;
the institutional relationship and India's slow referral-driven procurement cycle;
integration depth into timetable and LMS; and the sub-five-minute review workflow. This
matters practically because believing the corpus is the moat causes bad decisions — most
concretely, it would make us resist the move to selective, earned-trust review that
`architecture.md` correctly identifies as necessary at scale, because selective review
reduces label volume.

**CORRECTED 2026-07-29 — the original version of this decision claimed the corpus "solves a
capstone problem for free: the annotated evaluation dataset the project is graded on is a
by-product of the product working normally." That claim is wrong and has been removed.**

Faculty review is, by deliberate design, a bad ground-truth instrument. It is single-
annotator, so Cohen's κ is not computable from it at all. It is not blind — the reviewer sees
the model's answer first and is anchored by it, so a plausible-but-wrong extraction gets a
light edit rather than independent reconstruction. It is speed-optimised under a five-minute
budget that actively discourages careful adjudication. And recall is structurally
unmeasurable from it, because faculty only ever react to what the system already proposed.

The corpus remains valuable — for few-shot exemplars, regression testing, and future
fine-tuning. It is not the evaluation set. See Article VIII of `constitution.md`. The graded
evaluation dataset must be separately recruited, trained, double-annotated and frozen, and
that work is a real cost that had been wrongly assumed away.

**Alternatives Considered:**
- *Log corrections to a file for later* — the intent is the same but the data ends up
  unstructured and unlinked, which in practice means unusable. Rejected.
- *Add it after the capstone when the product is proven* — the corrections made during the
  pilot semester are the most valuable ones, and they are unrecoverable once made. Rejected.

**Trade-offs:**
- Storing what faculty got wrong is sensitive. A lecturer will reasonably object to a record
  of their corrections being used to evaluate them. Access must be restricted and the purpose
  stated plainly in the consent document, or this becomes a trust problem.
- Slightly more complex schema and write path on every review action.

---

## 2026-07-29 — Multi-tenant schema from the first migration

**Decision:** Every table carries an institution identifier from day one, and every query is
scoped by it, even though only one college exists.

**Reason:** Retrofitting tenancy is not a schema change, it is a data migration on live
student data, performed under time pressure, by a team that will be busy with something else.
The cost now is one column and a discipline; the cost later is a rewrite of every query plus
the risk of one college seeing another's data during the transition.

**Alternatives Considered:**
- *Single-tenant now, separate database per college later* — a valid model, and simpler
  today. Rejected because it makes cross-college research queries (which are our dataset's
  whole value) painful, and because per-college databases multiply operational work for a
  team of three.

**Trade-offs:** Every query is slightly more verbose and every developer must remember the
scope. Forgetting it is a data-leak bug rather than a visible error, which is the dangerous
kind — mitigate with row-level security in Postgres rather than relying on discipline.

**Scope (noted 2026-08-07):** this entry predates the 2026-07-30 platform split and binds the
**Product Platform**. Lab v0's `runs` table carries no institution identifier and is not in
violation: tenancy is obligation 9 of the [capture-contract.md](capture-contract.md), which the
Experiment Platform is exempt from. "From the first migration" means the first *Product Platform*
migration, which has not been written.

---

## 2026-07-29 — Live in-lecture transcription is out of scope for the capstone

**Decision:** ClassMind processes uploaded recordings. No real-time streaming transcription
during the lecture.

**Reason:** Live transcription adds classroom hardware, audio streaming, partial-transcript
handling, and reconnection logic. None of it touches the research question, which is about
extraction accuracy, not latency. It converts a software project into a software-plus-hardware
project at exactly the point where the team can least afford it.

**Alternatives Considered:**
- *Build live capture for demo impact* — a live demo does land better in a viva, and this was
  explicitly considered and rejected on schedule risk. The mitigation is to make the upload
  demo feel immediate: pre-record, upload live, show results in under a minute.

**Trade-offs:**
- Weaker demo theatre. A screen filling with live transcript is more impressive than a file
  upload, and viva scoring is partly emotional.
- The "record the lecture as it happens" product experience is deferred, and it is likely
  what a college actually wants to buy. Post-capstone.

---

## 2026-07-29 — One database: PostgreSQL with pgvector, not Postgres + FAISS

**Decision:** Structured events and their embeddings both live in PostgreSQL, using the
pgvector extension for semantic search. No separate FAISS index.

**Reason:** FAISS is an in-memory index that must be kept in sync with the database by hand,
persisted separately, and rebuilt when it drifts or corrupts. That is a second source of
truth for the same data, which
[Principle 4](../../../AI-Memory/01_Principles/PRINCIPLES.md) exists to prevent — and
sync bugs are silent, showing up as search results that are subtly stale rather than as
errors. One database means one backup, one connection, one thing to learn, and one place
where the truth lives.

At our scale — thousands of event embeddings, not hundreds of millions — pgvector's
performance is far beyond what we need. FAISS's advantage only appears at a scale we may
never reach.

**Alternatives Considered:**
- *FAISS as specified in the synopsis* — genuinely faster at very large scale, and zero extra
  infrastructure since it runs in-process. Rejected on the sync problem, not on speed.
- *A dedicated vector database (Pinecone, Weaviate, Qdrant)* — better tooling, but a third
  service to run, learn, and pay for. Rejected as premature.

**Trade-offs:**
- If ClassMind ever reaches tens of millions of vectors, pgvector will need replacing. That
  is a good problem and a contained change, because search sits behind its own interface.
- Deviates from the submitted synopsis; needs explaining to the guide.

---

## 2026-07-29 — Hosted LLM API behind a swappable interface; on-premise as a post-capstone milestone

**Decision:** All LLM calls go through one small internal module that the rest of the system
talks to. Behind it, a hosted API. "Runs entirely on the college's own servers" is a named
post-capstone milestone on the roadmap, not a vague possibility.

**Reason:** The synopsis specifies Llama 2 70B run locally. Two problems: Llama 2 is a 2023
model that newer open models have overtaken, and a 70B model needs roughly 40GB of GPU memory
even heavily compressed. Serving it reliably is an infrastructure project in its own right,
and this team's scarce resource is engineering time, not API credits. At capstone volume —
around twenty lectures — hosted inference costs a few hundred rupees.

The privacy argument for local inference is real but premature: it binds only when a college
signs a contract demanding data never leaves their premises. Keeping the swap behind one
module means that contract is a week of work, not a rewrite.

**Alternatives Considered:**
- *Local models as specified* — genuinely better on privacy and zero marginal cost, and the
  right answer for enterprise sales later. Rejected for the capstone on time cost.
- *Hosted with no abstraction layer* — less code today. Rejected: the abstraction is roughly
  thirty lines and it is the only thing making the on-premise milestone affordable.

**Trade-offs:**
- Dependency on an external service. If it has an outage during the final demo, we have no
  system — mitigate by caching all demo results ahead of time and never demoing live against
  a network we do not control.
- Ongoing cost that grows with usage, unlike a one-off hardware purchase.
- Sending lecture audio transcripts to a third party is exactly the thing the consent
  document must disclose. It is a promise we are making on behalf of faculty and students.
- The abstraction layer is a mild violation of "no abstraction until the third occurrence"
  ([Principle 2](../../../AI-Memory/01_Principles/PRINCIPLES.md)). Accepted deliberately: we
  already know of a second implementation and have committed to building it.

---

## 2026-07-29 — Build the LLM extractor first; pattern matching and NER become comparison baselines

**Decision:** Invert the synopsis's tiered build order. The LLM extractor is built first and
is the production path. Pattern matching and NER are built afterwards as *comparison arms*
behind the same interface — they are experiments, not tiers the data flows through.

**Reason:** The synopsis treats the tiered pipeline as the novel contribution and builds it
bottom-up: regex, then NER, then LLM. But the project's own research document states that
"code-switching makes pattern matching fragile" — so the bottom-up order spends months two
and three building the component we already predict will perform worst, and nothing works end
to end until roughly month five.

The research output is unaffected. The paper's finding is "we compared three approaches on
code-switched classroom speech and here is what each achieved" — that comparison is identical
whichever order they are built in. Building the strongest one first means we have a working
system early, real accuracy numbers early, and time to react when they disappoint.

**Alternatives Considered:**
- *Follow the synopsis order* — safer if the guide has approved the tiered pipeline
  specifically as the contribution. Rejected on schedule risk, with the note that the
  deviation must be explained rather than concealed.
- *Cheap filter + LLM hybrid* — pattern matching demoted to narrowing an hour-long transcript
  to candidate chunks before the LLM sees them, purely to cut cost. Not rejected — this is
  the likely production shape once cost matters, and it emerges naturally from the baseline
  work. Deferred until we have a measured cost problem
  ([Principle 3](../../../AI-Memory/01_Principles/PRINCIPLES.md)).

**Trade-offs:**
- If the LLM turns out to perform poorly, we will have built the product around the weak
  component. Mitigated by measuring on real lectures in Phase 1 rather than Phase 4.
- "We used an LLM" is less visibly novel to an examiner than "we designed a four-tier
  pipeline." The defence is the comparative evaluation and the error analysis, which is
  stronger research but requires being articulated well.
- Risk of the baselines never being built, since the product works without them. They are the
  research contribution — schedule them explicitly rather than leaving them to good
  intentions.
