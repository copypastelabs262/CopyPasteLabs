# Knowledge Sweep Plan — 2026-09-06

**Mode: plan. Nothing has been written to permanent memory.** This is the review gate.
Produced by Knowledge-Promoter v1.0.0 over all pending Inbox entries.

Pending entries: **10**   Candidates: **43**   Clusters: **19**
Proposed: **7 promote · 3 merge-into-promote · 5 defer · 4 reject** · Skipped (malformed): 0

Recurrence = number of distinct entries a finding appears in. 2+ ⇒ eligible for `Validated`.

---

## PROMOTE — recurs across 2+ entries ⇒ Validated

### P1 · Mistake · `06_Mistakes/safety-net-scoped-to-events-not-state.md` · **Validated** · recurrence 3
**Merges:** `_platform/reconcile#cand-001` + `classmind-v1#cand-004` + `transcript-guard#cand-005`
A safety net (autosave/commit hook) was defined by the tool-calls expected to reach it, and scoped
wider than the event that triggered it: it missed shell commits, and it swept other agents' work via
`git add -A`. Three independent sessions hit it. Candidate `classmind-v1#cand-004`'s own note asks for
exactly this merge: *"define the net by the state to be protected, not by the tool calls expected to
reach it, and scope its action to what actually changed."*
_Why Validated: three entries, one finding._

### P2 · Principle · `01_Principles/` (append) · **Validated** · recurrence 4
**Merges:** `transcript-guard#cand-003` (principle) + `classmind-v1#cand-001` + `transcript-guard#cand-001` + `cost-controls#cand-003`
*A check needs a state to write and a consumer that acts on it; a verdict nothing reads is not a guard.*
Seen as: a guard written from a bug report's prose that never ran against the real input (dead branch);
a heuristic that passed every fixture yet was impossible in production; a verification script that exited
0 on a failed run. One principle, four sightings.

### P3 · Learning · `02_Learnings/canonicalise-upload-content-type.md` · **Validated** · recurrence 2
**Merges:** `upload-acceptance#cand-001` + `gemini-phase#cand-001`
Exact-MIME whitelists reject real files (the browser reports `.aac` as `audio/vnd.dlna.adts`). Accept on
type OR extension, then canonicalise from a curated extension map that outranks the browser's report.

### P4 · Mistake · `06_Mistakes/unmetered-paid-path.md` · **Validated** · recurrence 2
**Merges:** `cost-controls#cand-003`-adjacent incident + `gemini-phase#cand-003`
A new paid path shipped without metering, and the unmeasured-cost defect that emptied the balance on
2026-08-30 recurred on the Ask path. `gemini-phase#cand-003` is explicitly filed as the recurrence.
_This recurrence is what raises the original cost-incident learning to Validated._

---

## PROMOTE — single sighting, high-confidence or operator directive ⇒ Draft

### P5 · Learning · `02_Learnings/blocker-silently-cleared.md` · **Draft** · `_platform/reconcile#cand-004`
A blocker that has silently been cleared is as damaging as a stale fact and harder to spot — the repo
still says "blocked" while the block is gone.

### P6 · Learning · `02_Learnings/recall-eval-for-precision-tuned-methods.md` · **Draft** · `classmind-v1#cand-002`
A precision-tuned lexicon/keyword extractor fails silently to near-zero recall on an off-corpus input;
conservative-looking output is indistinguishable from correct restraint. Hold out a different sub-corpus
and check the *misses* by hand. _Per the candidate's note: strip ClassMind specifics; numbers go in the basis._

### P7 · Learning · `02_Learnings/rate-limit-budget-on-reservation.md` · **Draft** · `cost-controls#cand-002` (+ `cand-001`)
A provider may charge rate-limit budget on the reservation, not on actual usage; retrying into a rate
limit amplifies it, so the backoff decision belongs to the run, not the adapter.

---

## MERGE into existing/new during promote (grouped, not separate files)

- `transcript-guard#cand-002` (min-sample threshold skips the check exactly where it's needed) → folds into **P2**.
- `transcript-guard#cand-004` (test asserts a key the API never returns; fails silently) → folds into **P2** as a worked case.
- `cost-controls#cand-001` (retry amplifies rate limit) → folds into **P7**.

---

## DEFER — not ready; stays pending

### D1 · `_platform/reconcile#cand-002` (open_question) — **resolved today, recommend close/promote**
"End-Session's upstream_merge_base boundary degenerates to base==head on an auto-pushed repo." This was
**fixed in End-Session v1.0.1 on 2026-09-06.** Recommend: promote as a short Mistake (the fix is the
prevention) or close as resolved. Operator's call — flagged rather than auto-actioned because it changed
state after capture.

### D2 · `_platform/reconcile#cand-005` (open_question) — **resolved today**
"This Inbox has no consumer — Knowledge-Promoter is a stub." That consumer now exists (this skill). Close.

### D3 · `classmind-v1#cand-003` (pattern: replay real provider responses) — **hold for recurrence**
The candidate's own note asks to defer: *"Validated needs a second, independent project… hold until a
non-ASR provider (payments, email, LLM) has used it."* Textbook DEFER. Promote when a second provider does.

### D4 · `groq-schema#cand-005` (open_question: did the Groq run complete, what did it cost?) — project fact
Belongs in ClassMind's own records, not global memory. Route to `Projects/classmind/.knowledge/`.

### D5 · `recovery#cand-003` (decision: the Inbox backlog is deliberate, pending a Promoter) — **superseded**
The condition it describes (no Promoter) is being resolved now. Close once this sweep runs.

---

## REJECT — recorded with reason

### R1 · `design-master#cand-003` — reason `out_of_scope` (project decision)
"ClassMind V3 commits to a single dark-first identity ('The Observatory')." A product-design decision,
already local to ClassMind. Global memory holds cross-project engineering knowledge, not one app's identity.

### R2 · `gemini-phase#cand-004` — reason `out_of_scope` (project decision)
"ClassMind adopts classroom-app grammar but refuses the LMS/communication product." Same: a ClassMind
product-scope decision; belongs in the project's `decisions.md` (and already does).

### R3 · `recovery#cand-001` — reason `out_of_scope` (project decision)
"The Groq provider experiment is closed; ff0721de is its final outcome." A ClassMind project decision.

### R4 · `design-master#cand-001` — reason `duplicate-risk / thin`
"A position:fixed decorative background paints only the first viewport in a full-page render." Real but
narrow and tool-specific; low reuse across unrelated projects. Hold unless it recurs.

---

## Everything else, accounted for

The remaining single-sighting high-confidence Learnings/Patterns are **candidate Drafts** but are held
this sweep to keep the first promotion batch focused and legible (generous capture, strict promotion):
`_platform#cand-003` (heredoc write to dodge the hook), `_platform#cand-006`/`transcript#cand-002`
(write the failure condition into the decision that might fail — **strong, likely P2-adjacent Principle
next sweep**), `_platform#cand-007` (SDK error carries status AND statusCode), `cost-controls#cand-004`
(output contract belongs to the engine, adapter translates), `design-master#cand-002` (design loop judges
running product from pixels), `design-master#cand-004` (stored provider errors are evidence, translate at
render boundary), `groq#cand-001` (strict-schema 400 is a verdict on output), `groq#cand-002` (client
timeout destroys the server run it awaits), `groq#cand-003` (paid script defaulted to a sibling app's
port), `groq#cand-004` (Supabase OAuth fails open to Site URL), `upload#cand-002`/`cand-003` (paid-op
pre-flight authorization; per-process opt-in for dangerous dev flags), `upload#cand-004` (idempotent setup
must converge, not skip), `recovery#cand-002` (~6x completion-token variance between model families),
`gemini#cand-002` (a grounded Q&A ceiling is its extraction contract), `v4-overnight#cand-001` (grow
destinations inside existing routes, never move them), `v4-overnight#cand-002` (static screenshots can't
judge a conversational surface).

Several of these are strong and will likely promote next sweep — flagged now so they are not lost. Recommend
the operator scan this list and pull any that should jump to this batch.

---

*Approve, or edit any row, and re-invoke in `execute` mode. Until then, permanent memory is untouched.*
