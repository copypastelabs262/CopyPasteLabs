# Decisions — ClassMind

Project-scoped choices. Newest at the top.

If a decision here would apply to a future unrelated project, it belongs in
`AI-Memory/07_Decisions/` instead — say "Promote this" to move it.

All six decisions below were taken together on 2026-07-29, before any code existed. Each one
deviates from `research/2026-07-24-synopsis-full.md`. The synopsis is not wrong so much as
written before we had to build it — these are the corrections that come from planning the
build rather than describing it.

**If the synopsis has already been formally submitted and graded, these deviations need to be
explained to the guide, not hidden.** A capstone that says "we changed approach X for reason
Y and here is the evidence" reads as engineering maturity. A capstone that quietly ships
something different from its synopsis reads as scope drift.

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
