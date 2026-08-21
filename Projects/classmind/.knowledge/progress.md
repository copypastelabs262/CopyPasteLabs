# Progress — ClassMind

Reverse-chronological. Newest at the top. Each entry is what changed and what it unblocked —
not a commit log, which git already provides.

Entries are snapshots of what was true when written and are never rewritten. Where a later entry
resolves something an earlier one recorded as blocked, the earlier line gets a dated marker
pointing forward — it does not get edited away.

## 2026-08-21 — Milestone 2's build finished on 2026-08-19; the documents caught up today

**Done (2026-08-19, recorded here on 2026-08-21):** Milestone 2 component 3 — the
`TranscriptionProvider` boundary, the Sarvam Batch adapter, the transcribe and poll routes, and
the provenance module. Committed as `b3db63b`. A run can now go from stored audio to a stored raw
transcript with provenance written in the same `UPDATE` as the transcript, because Constitution
IV forbids retrofitting it. Provisioning the backend also surfaced two real bugs, both fixed in
the same commit: `setup-storage.mts` checked `error.status === 404` but the SDK reports a missing
bucket as `status` 400 with `statusCode` `"404"` — a *string*, in a different field — so the
existence probe read as fatal and the bucket could never be created; and the bucket's 500 MiB
file limit was rejected outright because the Supabase Free plan caps the global limit at 50 MB.
Full detail in [`sessions/2026-08-19-milestone-2-component-3.md`](sessions/2026-08-19-milestone-2-component-3.md).

**Done (2026-08-21):** The 2026-08-19 session left no record at all — no session log, no entry
here, no `roadmap.md` line — and **its commit was never pushed**, so for two days `origin/master`
stood at `98a7b7a` and Shiv and Darsh could not see any of component 3. Both are now fixed:
`b3db63b` is pushed, and the missing session log has been written retroactively and marked as
such.

The push failure has a structural cause worth naming, because it will recur: `scripts/autosave.sh`
is wired to `PostToolUse` on `Write|Edit`, so it never fires for a commit made through the shell —
which is exactly the deliberate, well-messaged commit `CLAUDE.md` asks for at the end of a
session. **The auto-push safety net covers the incidental path and not the intentional one.**
Recorded as a candidate for the BuilderOS platform, not fixed here.

**Sarvam's terms on secondary use of submitted audio have been read, and the vendor choice
stands.** This clears a blocker that had been listed as "Next" since 2026-07-29. Two honest
caveats: the reading happened before the API key was obtained but was never written down, so this
entry records it on Shyam's confirmation rather than from a contemporaneous note; and no extract
or clause reference was kept. **If a specific term ever matters — retention, deletion, training
use — it must be re-read and quoted, not recalled.** The unchecked box in `lab/v0-ingestion/README.md`
and `roadmap.md` had become a false blocker, which is the same class of error the 2026-08-11 audit
found and corrected.

**In progress:** Nothing.

**Blocked:** Unchanged except for Sarvam's terms, now cleared. The walkthrough is unrun, the
college partnership has not started, and there is no consent/data-protection position. **No live
Sarvam call has been made yet**, so Milestone 2 is built but unverified, Constitution VII's
one-command regeneration is unmet, and the Azure Blob SAS upload convention in
`uploadToPresignedUrl()` remains an untested assumption inferred from `storage_container_type`.

**Next:** **Book the walkthrough day.** Not Milestone 2's remaining work. `decisions.md`
(2026-08-11) named its own stop condition — *"If the next session again ends with Lab progress and
no walkthrough date, that is this decision going wrong, and the answer is to stop building and
book the day"* — and the 2026-08-19 session met it exactly. `roadmap.md` Stage A needs zero code
and explicitly states that Lab v0's progress does not advance it. Transcript normalization and
display are the remainder of Milestone 2 and are deliberately *not* next.

## 2026-08-11 — Documentation reconciled with the code; Lab v0's justification corrected

**Done:** An audit of every ClassMind document against the code that now exists, and a
seven-file reconciliation. The substantive finding was a **false claim**, not a stale one:
`README.md` said "Lab v0 exists only because steps 2 and 8 of [the walkthrough] require a
transcript." The frozen protocol says step 2 is "transcribe with whatever ASR is nearest to
hand… 20 min." **The walkthrough never required Lab v0.** Engineering work was being justified by
a mandate a frozen document does not contain — the worst class of error here, because the two
co-founders reading only the repo had no way to catch it.

Replaced with the honest version, now canonical in `decisions.md` (2026-08-11): Lab v0 is an
**independently chosen** Experiment Platform for repeatable, measurable, reproducible
transcription. It validates no concept, discharges no part of the walkthrough, and **the
walkthrough remains the domain-model validation gate.**

A second finding was a misattribution. `lab/README.md` banned "No database, no HTTP API" citing
**Constitution VII** — but Article VII governs *evaluation-run records*, prescribes "one flat
table and a directory of JSONL files," and never mentions APIs. A sentence prescribing one table
had been read as a prohibition on tables. The constraint is withdrawn as a misreading; **the
Constitution needed no change and got none.** "No auth, no embeddings" survives and still binds.

Four decisions made on 2026-08-07 that had lived only in commit messages and source comments are
now recorded in `decisions.md`: the stack, the database/HTTP-API reversal, Sarvam's async Batch
API, and Course Context staying out of Lab v0. Two older entries gained dated scope notes rather
than edits — the 2026-07-29 multi-tenancy decision (binds the Product Platform; `runs` is not in
violation) and the 2026-07-30 platform split (its "Experiment Platform comes *after* the
walkthrough" clarification is no longer what we are doing, and that change is now visible).

Frozen and untouched, deliberately: `walkthrough-protocol.md`, `constitution.md`,
`capture-contract.md`, `domain-model.md`, `architecture.md`. No source code was modified.

**In progress:** Nothing.

**Blocked:** Unchanged from 2026-08-07 — see below. Nothing in this pass cleared or created a
blocker.

**Next:** Milestone 2 component 3 — the `TranscriptionProvider` interface, the Sarvam adapter,
and the submit/poll routes. Separately and still unscheduled: **book the walkthrough day.** Its
continued slippage is the named cost of the 2026-08-11 decision, and it needs a date, not a
resolution.

## 2026-08-07 — Lab v0 built to Milestone 2, component 2

**Done:** ClassMind split into three directories — `.knowledge/` (permanent), `lab/`
(disposable), `product/` (empty until the Stage C gate) — making the 2026-07-30 platform
decision physical. Then Lab v0 scaffolded and built to two thirds of Milestone 2.

*Milestone 1:* Next.js app with typed env access, an anon-key browser Supabase client and a
`server-only`-guarded service-role client. `npm run build` passes with no real credentials and
`/` is confirmed dynamic, so the build never depends on reaching Supabase. Found and fixed a real
bug: the scaffolded `.gitignore` was silently swallowing `.env.example`, confirmed with
`git check-ignore -v` before and after.

*Milestone 2, component 1:* the `runs` table migration and `scripts/setup-storage.mts`. RLS
enabled with zero policies — deny-by-default, since only the service-role client touches the
table. The migration carries a guardrail comment: no foreign key to any course or session
concept, and none to be added speculatively, because which table a future FK should target is
what the walkthrough exists to settle.

*Milestone 2, component 2:* `POST /api/runs` — validates against shared MIME and size limits,
generates the run id server-side so the storage path is known before the row is written, and
mints a Supabase signed upload URL. **Audio bytes never touch this server.** Incorporated the
async job lifecycle: Sarvam's Batch API is asynchronous, so a run models a job rather than a
request, and `provider_job_id` is what makes an in-flight transcription resumable across a
refresh or restart.

**Blocked:** Two manual steps, both needing account access, both blocking a live end-to-end test
but not further building — no Supabase project or `.env.local`, so the migration has never been
applied and the bucket has never been provisioned; and no Sarvam API key, which is itself gated
on the terms below.
*(Resolved 2026-08-19: the Supabase project, `.env.local` and a Sarvam API key all exist; the
migration is applied and the bucket provisioned. Left in place as the record of what was true
then.)*

**Next:** Milestone 2 component 3 — `TranscriptionProvider` interface, Sarvam adapter,
submit/poll routes.

**Watch:** Sarvam's terms on secondary use of submitted audio have been listed as "Next" since
2026-07-29 and are still unread. Ten minutes, a legal precondition to the first upload, and
capable of invalidating the vendor choice outright — which would waste the adapter that is next
in the queue.
*(Resolved 2026-08-21: read, and the vendor choice stands — though the reading was never written
down at the time. See the 2026-08-21 entry for the caveats that come with recording it late.)*

## 2026-07-30 — Experiment/Product platform split encoded

**Done:** Recorded the decision to build ClassMind as two distinct systems — a disposable
**Experiment Platform** that generates evidence, and a **Product Platform** built only after the
concepts are validated. Encoded it across five documents from each one's own angle, without
duplicating rationale: `decisions.md` holds the full reasoning (source of truth); `roadmap.md`
was re-sequenced into the gated pipeline Experiment → Evidence → Validated Concepts → Product;
`capture-contract.md` and `constitution.md` each gained a short scope note; `project.md` and
`architecture.md` got orientation and a guardrail banner. Also refreshed `project.md`'s stale
current-state and key-files (they still said "blocked on founder sign-off").

The one sharpening added beyond the brief: **disposable in code, not in evidence.** The
Experiment Platform's software is throwaway, but the numbers and their provenance are the
capstone contribution and are not — so the Constitution splits by platform (production-data
articles bind the product; research-validity articles IV/VII/VIII/IX bind the experiment too)
rather than exempting the experiment wholesale. Also flagged, and recorded in the decision: the
*first* walkthrough needs no Experiment Platform at all — it is manual.

`walkthrough-protocol.md` was deliberately **not** touched — it is frozen and pre-registered,
and the split does not materially change it.

**In progress:** Nothing.

**Blocked:** Git remains uncommitted/unpushed in this environment (push hits a proxy 403). The
knowledge base is 5+ commits ahead of `origin/master`, and `capture-contract.md` and
`walkthrough-protocol.md` have never been committed at all — Shiv and Darsh cannot see them yet.
*(Resolved 2026-08-07: both files are committed and the working tree is clean and in sync with
`origin/master`. Left in place as the record of what was true then.)*

**Next:** Run the manual walkthrough (Stage A). It needs no software.
*(Still true and still unrun as of 2026-08-11. Lab v0 was built instead, by a decision recorded
in `decisions.md` 2026-08-11 — the walkthrough remains the gate, not a discharged step.)*

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
*(Resolved 2026-08-07: the lock cleared and everything is committed. Left in place as the record
of what was true then.)*

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
