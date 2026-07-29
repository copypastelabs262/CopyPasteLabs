# Progress — ClassMind

Reverse-chronological. Newest at the top. Each entry is what changed and what it unblocked —
not a commit log, which git already provides.

## 2026-07-29 (later) — Domain model defined

**Done:** Wrote `domain-model.md`, the ubiquitous language for the product. It is organised
around one distinction that the earlier documents did not make: **what was said** (the Record
— permanent, append-only) versus **what is currently true** (the Ledger — derived by reading
Attestations in order).

Four concepts were abolished. *Academic Event* collapsed four unrelated kinds of thing into
one bucket, so most fields were empty most of the time and the product's central "must versus
should" distinction became a column that could be left blank — replaced by **Commitment**,
**Notice**, **Guidance**. *Deadline* was demoted from an entity to a property of a Commitment;
modelling it as a peer of Assignment is what made cross-lecture tracking look unsolvable.
*Knowledge* was replaced by **Course Ledger** — it could not be pointed at, owned, or changed.
*Exam topic* became **Scope** on the Exam Commitment, so topics accumulate through the term
instead of scattering.

Twelve concepts nobody had listed were added, of which three are load-bearing: **Consent
Grant** (Article I is unenforceable without it), **Authority** (answers who may attest, which
is a fact about the world rather than an access-control setting), and **Observer** (three
Observers disagreeing about one Utterance *is* the research contribution).

The verb changed from *approve* to **attest**, on the reasoning that a lecturer is not
inspecting an AI's homework — they are confirming their own words. "Did you say this?" is a
two-second memory check; "is this extraction correct?" is data entry, which is the thing that
kills adoption.

Verified article by article against `constitution.md`. No contradiction found. One genuine
tension surfaced and was resolved in writing: Article I's erasure right versus Article II's
append-only rule — "never edited in place" and "never deletable" are different rules, and
erasure must be a designed cascading operation built before the first real Recording.

**In progress:** Nothing.

**Blocked:** Git is still stuck on a stale `.git/index.lock` that this environment cannot
delete. Nothing since 2026-07-28 is committed, and the auto-save hook is blocked too — which
under the single-writer model means both read-only co-founders are looking at a repository
with no ClassMind in it at all.

**Next:** Three cheap experiments the domain model depends on and cannot answer by reasoning.
Annotate three real Sessions and count what fraction of Observations refer to an already-known
Commitment — under 5% and the Observation/Commitment split is ceremony at capstone scale, over
20% and it is mandatory. Print twenty Observations on paper and time three lecturers attesting
them. Read Sarvam's terms on secondary use of submitted audio before the first upload.

## 2026-07-29 — Project defined; architecture signed off

**Done:** Created the project from `_TEMPLATE` and archived all five pre-build research
documents verbatim under `.knowledge/research/`, with an index naming the full synopsis as
canonical and recording four known limitations of that research (unverified novelty claims,
targets set before measurement, no privacy analysis, directional market sizing).

Wrote `project.md`, `requirements.md`, `roadmap.md` from the canonical synopsis rather than
from all five — the shortened drafts are read-only history and nothing is derived from them.

Reviewed the synopsis as a build plan rather than as a document, and found six places where
it would cost us time or correctness. All six were put to the founders and confirmed:

1. Build the LLM extractor first; pattern matching and NER become comparison baselines rather
   than sequential tiers. The synopsis order spends months on the component its own research
   predicts will perform worst, and nothing works end to end until month five.
2. Hosted LLM API behind a swappable module, with fully on-premise operation promoted to a
   named post-capstone milestone rather than a vague future option.
3. One database — PostgreSQL with pgvector — instead of PostgreSQL plus a separately
   maintained FAISS index.
4. Live in-lecture transcription cut from capstone scope.
5. Multi-tenant schema from the first migration.
6. Every faculty correction stored as labelled data from day one.

Wrote `architecture.md` around a single load-bearing boundary: **proposed events versus
approved events**. Nothing reaches a student without a human approving it, which means an
extraction bug can never surface as a wrong deadline, and the extractor can be replaced
freely without touching the product surface.

**In progress:** Nothing. Awaiting Phase 0.

**Blocked:**
- **No college partnership.** The 15–20 real lectures needed for evaluation require
  institutional permission. This has the longest lead time of anything in the project and has
  not started. It is the item most likely to sink the capstone.
- **No consent or data-protection position.** Classroom audio captures identifiable students,
  not only the lecturer. India's DPDP Act 2023 applies. Required before the first real
  recording — and the hosted-LLM decision means transcripts leave our infrastructure, which
  must be disclosed.

**Next:** Phase 0 (see `roadmap.md`) — open the college conversation, draft the consent
position, and record 2–3 deliberately code-switched mock lectures so development is not
blocked while the real-data conversation runs. Then a thin vertical slice: one lecture,
end to end, crude but complete, by week 4.

**Watch:** transcription quality on real Hinglish is an untested assumption underneath the
entire project. Measure it in Phase 1, not Phase 4.
