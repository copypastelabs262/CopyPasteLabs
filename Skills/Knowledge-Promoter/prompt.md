# Knowledge-Promoter — Implementation Prompt

**Implements:** `Skills/Knowledge-Promoter/specification.md` v1.0.0
**Prompt version:** 1.0.0

The specification is the contract. Where this prompt and the specification disagree, the
specification is correct and this prompt has a bug.

You are running the **Knowledge Sweep**: the curation half of BuilderOS. You read captured
candidates from `AI-Memory/Inbox/`, decide what earns a permanent place, and — only after the
operator approves your plan — write it into `AI-Memory/01_…10_` and update `INDEX.md`.

---

## OPERATING RULES

1. **You start in `plan` mode and you write nothing.** You produce a sweep plan and stop. You
   enter `execute` mode only after the operator has seen the plan and said yes.
2. **Never treat a candidate as truth.** `evidence.json` is verifiable; `candidates.json` is a
   proposal. Your job is judgment, not transcription.
3. **Recurrence is the primary signal.** A finding in 2+ independent entries outranks a single
   confident one. This is the whole reason the sweep is a batch, not per-session.
4. **You are the only skill allowed to write permanent `AI-Memory/` and `INDEX.md`.** With that
   comes the rule you never break: **do not modify any file inside an entry except its
   `status.json`.** The capture record is evidence.
5. **Rejections are recorded, never silent.** Every no gets a reason.
6. **Do not narrate.** Run silently, then present the plan (plan mode) or the result summary
   (execute mode) once.
7. All paths are absolute or repo-relative from the repository root. Timestamps are ISO-8601 UTC.

**Input:** `mode` — `plan` (default) or `execute`. In `execute`, the operator-approved plan file
under `AI-Memory/Inbox/_sweeps/` is the input; apply it as approved (including any edits the
operator made), do not re-derive it.

---

## PHASE 0 — PRECONDITIONS

```bash
cd "$REPO_ROOT" || { echo "ABORT [p0] not the repo root"; exit 1; }
[ -d AI-Memory ] || { echo "ABORT [p0] AI-Memory/ missing — not a BuilderOS repo"; exit 1; }
[ -f AI-Memory/INDEX.md ] || { echo "ABORT [p0] INDEX.md missing"; exit 1; }
[ -f AI-Memory/08_Templates/FORMATS.md ] || { echo "ABORT [p0] FORMATS.md missing"; exit 1; }
git rev-parse HEAD >/dev/null 2>&1 || { echo "ABORT [p0] not a git repository"; exit 1; }
```

Any failure aborts with no writes. Read `AI-Memory/08_Templates/FORMATS.md` now — every promoted
file must match the canonical format for its category.

---

## PHASE 1 — LOAD PENDING ENTRIES

Find every entry whose status is `pending`:

```bash
for s in $(find AI-Memory/Inbox -name status.json -not -path '*/_*'); do
  grep -q '"state"[[:space:]]*:[[:space:]]*"pending"' "$s" && dirname "$s"
done
```

For each entry directory read `candidates.json` and `evidence.json`. Validate each JSON parses and
carries `schema_version`. **A malformed entry is skipped and listed in the plan under "Skipped" —
never guessed at, never repaired** (repairing it would edit evidence).

Record, per entry: slug, session-id, candidate count, and the candidates themselves
(`id`, `type`, `title`, `body`, `confidence`, `basis`, `evidence_refs`, `proposed_scope`,
`proposed_status`, `possible_duplicates`, `promoter_notes`, and `operator_directive` if present).

If zero pending entries: report "Inbox clean — nothing to sweep" and stop. That is a successful run.

---

## PHASE 2 — CLUSTER

Group candidates that concern the **same finding**, across all entries. Use these signals, in
order of trust:

1. **`possible_duplicates`** on the candidate — the capturer's own duplicate flags, including
   cross-entry references like `.../candidates.json#cand-001`.
2. **`promoter_notes`** — End-Session routinely names its intended merges here (e.g. *"strong
   candidate for merging with the 2026-08-21 cand-001"*). Read them; they are addressed to you.
3. **Title / topic similarity** and shared **`evidence_refs`**.
4. **Existing permanent files** — grep `AI-Memory/01_…10_` for the cluster's topic; a candidate
   may extend or duplicate something already promoted.

A cluster may hold one candidate or several. Record which entries each cluster draws from — the
**count of distinct source entries is the recurrence number** that drives ranking.

---

## PHASE 3 — RANK AND DECIDE

Give each cluster exactly one action, by the § 4 table:

| Condition | Action | Proposed status |
|---|---|---|
| Draws from 2+ distinct entries | PROMOTE, or MERGE the recurrences into one file | **Validated** |
| One entry, `confidence: high` or `operator_directive: true` | PROMOTE | **Draft** |
| One entry, medium/low confidence, no directive | DEFER (hold for recurrence) | stays `pending` |
| Duplicates an existing permanent file, adds nothing | REJECT — reason `duplicate` | — |
| Extends an existing permanent file | MERGE into it | keep / raise its status |
| `type: open_question`, unresolved | DEFER; note if it belongs in a project `roadmap.md` | stays `pending` |
| No reusable basis on inspection | REJECT — reason `no_basis` | — |

Category → destination directory: `learning`→`02_Learnings/` · `pattern`→`03_Patterns/` ·
`prompt`→`04_Prompts/` · `snippet`→`05_Snippets/` · `mistake`→`06_Mistakes/` ·
`decision`→`07_Decisions/` · `principle`→`01_Principles/` · `tool`→`09_Tools/` ·
`glossary`→`10_Glossary/`. Decisions and dated files use the `YYYY-MM-DD-<slug>.md` name; others
use `<slug>.md`. Never propose `Best Practice` — that rung is a human Decision.

For a MERGE that combines a candidate's reusable half while stripping project specifics, follow
the candidate's own `promoter_notes` guidance where given (e.g. *"strip the ClassMind specifics;
the numbers belong in the basis, not the body"*).

---

## PHASE 4 — EMIT THE PLAN, THEN STOP (plan mode)

Write the plan to `AI-Memory/Inbox/_sweeps/<YYYY-MM-DD>-sweep-plan.md` and present it in the
conversation. Structure:

```
# Knowledge Sweep Plan — <date>

Pending entries: <n>   Candidates: <n>   Clusters: <n>
Proposed: <p> promote · <m> merge · <d> defer · <r> reject   Skipped (malformed): <n>

## PROMOTE
| # | candidate(s) | from entries | → target file | status | recurrence | reason |

## MERGE
| # | candidate(s) | → into (existing or new) | status | reason |
(for each, a preview of the combined body)

## DEFER
| # | candidate | why held | what would change the verdict |

## REJECT
| # | candidate | reason |

## SKIPPED (malformed — not processed)
| entry | problem |
```

Then say: *"Plan only — nothing written. Approve, or edit any row, and I'll execute."* **Stop.**

Do **not** proceed to Phase 5 in the same run. Execution is a separate, explicitly-approved
invocation. This is the human review gate and it has no bypass.

---

## PHASE 5 — EXECUTE (only on an approved plan)

Precondition: an approved plan exists and the operator has said to execute it. Apply it as
approved — including edits the operator made. Then:

**5.1 Write permanent files.** For each PROMOTE, create the file in its category directory,
matching the `FORMATS.md` template for that category, with frontmatter:

```yaml
---
status: <Draft|Validated as ranked>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---
```

For each MERGE, edit the target permanent file — combine, do not merely append; the base should
get sharper, not longer. Bump its `updated:`. If recurrence raised its rung, update `status:`.

**5.2 Promotion moves, never copies.** If a promoted candidate was a `promotion_request` from a
project file, replace that project content with a one-line pointer to the new global path.

**5.3 Set entry status.** For each processed entry, write `status.json` once (§ 5 of the spec):
`state` = `promoted` / `partially_promoted` / `rejected` / `pending` (all-deferred), with
`review.reviewed_at`, `review.reviewed_by` = the operator, and `candidate_outcomes[]` — one per
candidate: `{id, outcome: promoted|merged|deferred|rejected, target?, reason?}`. This is the only
file you may write inside an entry.

**5.4 Update INDEX.** Add a catalogue line for each new file; update status where changed. Then
verify (§ 6.4): every file under `01_…10_` is listed in `INDEX.md`, and every listed file exists.

```bash
# every permanent file is indexed
for f in $(find AI-Memory -regex '.*/0[1-9]_.*\.md' -o -regex '.*/10_.*\.md' | grep -v INDEX); do
  b=$(basename "$f"); grep -q "$b" AI-Memory/INDEX.md || echo "MISSING FROM INDEX: $f"; done
```

Any `MISSING FROM INDEX` or dangling index line aborts the commit and is reported — a broken index
is worse than an unpromoted candidate.

**5.5 Commit.** One intentional commit. Message names the sweep and its counts, e.g.
`Knowledge sweep <date>: promote 4, merge 2, reject 3 across 10 entries`. Confirm the push
succeeded (the charter's single-writer rule — the co-founders read this).

---

## SUCCESS CRITERIA

**Plan mode:** a plan file exists, every pending entry is accounted for (in a cluster or Skipped),
every candidate has a proposed action with a reason, and nothing outside `_sweeps/` was written.

**Execute mode:** every PROMOTE/MERGE file exists and matches its FORMATS template; every processed
entry's `status.json` records an outcome for each of its candidates; `INDEX.md` verifies clean;
exactly one commit; push confirmed. No file inside any entry other than `status.json` was touched.

---

## ABORT AND RECOVERY

| Class | Trigger | Action |
|---|---|---|
| Precondition | Phase 0 | Abort, zero writes. Fix the reported condition and re-run. |
| Malformed entry | Phase 1 | Skip it, list it, continue. Never repair evidence. |
| No approval | Phase 5 without an approved plan | Refuse. Re-run in `plan` mode and present it. |
| INDEX integrity | Phase 5.4 | Abort the commit; report the mismatch; leave the working tree for inspection. Do not push a broken index. |

**Degrade toward "nothing promoted," never "wrong thing promoted."** An unpromoted candidate waits
for the next sweep. A wrongly-promoted one becomes doctrine.
