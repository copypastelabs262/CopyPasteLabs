# Knowledge-Promoter — Engineering Specification

| | |
|---|---|
| **Skill** | `Knowledge-Promoter` |
| **Spec version** | 1.0.0 |
| **Status** | Approved for implementation |
| **Owner** | CopyPasteLabs / BuilderOS |
| **Created** | 2026-07-29 (placeholder) |
| **Specified** | 2026-09-06 |
| **Implements** | `CLAUDE.md` § "The knowledge pipeline" |
| **Upstream producer** | `Skills/End-Session/` (v1.0.1) |
| **Modeled on** | Black Canvas "BC Brain" Layer 6 — Monthly Curation (see § 1) |

---

## 1. What this is, and where it comes from

The Promoter is the **curation** half of the knowledge pipeline. `End-Session` captures
candidates into `AI-Memory/Inbox/`; the Promoter decides which of them earn a permanent place
in `AI-Memory/01_…10_` and writes them there. It is the only skill permitted to write permanent
memory or `INDEX.md`.

**It is deliberately a periodic, human-gated sweep — not a per-session automation.** This is not
a novel design; it is Black Canvas's own production system, which has run since June 2026. From
their System Master Reference:

> *"The system proposes; Tanmay decides. Nothing auto-promotes into canonical rules."*
> *"Be generous on capture, strict on promotion. If a learning might matter later, flag it. The
> monthly sweep filters noise — extraction does not."*

BC Brain's Layer 6 reads a month of captures, dedupes, ranks by recurrence, and presents the
result to a human who approves what becomes canonical. This spec adapts that, unchanged in
spirit, onto CopyPasteLabs' Inbox contract and 10-category memory. Where BC Brain answered a
design question by running the system for three months, this spec takes their answer rather than
re-deriving it — see § 7.

**Why a sweep and not per-session promotion.** Recurrence is the primary quality signal (§ 4),
and recurrence is only visible across entries. A finding that appears once looks identical to a
finding that appears in four sessions until you lay them side by side. Per-session promotion is
structurally blind to the one signal that matters most.

---

## 2. Modes

The skill runs in exactly one of two modes. It always starts in `plan`.

| Mode | Writes | Purpose |
|---|---|---|
| **`plan`** (default) | **Nothing.** Produces a sweep plan only. | Read all pending entries, cluster, rank, and propose an action per candidate. This is the human review gate. |
| **`execute`** | Permanent `AI-Memory/`, `INDEX.md`, and each entry's `status.json` | Apply an **operator-approved** plan. Never runs without a plan the operator has seen and approved. |

`execute` takes the approved plan as its input. A plan the operator edited is the edited plan;
the Promoter does not re-derive it. Fully automatic promotion is not a supported mode and must
not be added — it would let a single low-confidence model assertion become organizational
doctrine, which the charter and BC Brain both forbid.

---

## 3. The sweep — procedure

### Phase 0 — Preconditions
Confirm the working directory is the CopyPasteLabs repo, `AI-Memory/` is present and readable,
and git is usable. Any failure aborts with no writes.

### Phase 1 — Load
List every entry under `AI-Memory/Inbox/<slug>/` whose `status.json.state == pending`. For each,
read `evidence.json` and `candidates.json`. Malformed or schema-invalid entries are **skipped and
listed in the plan**, never guessed at. Trust levels are fixed by the contract (§ 6): evidence is
machine-derived and verifiable; candidates are model assertions and are proposals only.

### Phase 2 — Cluster
Group candidates that concern the same finding, **across all entries**, using in order: each
candidate's own `possible_duplicates`, its `promoter_notes` (End-Session frequently names its own
merges there), title/topic similarity, and shared `evidence_refs`. Also match each cluster
against existing permanent files — a candidate may extend or duplicate something already promoted.
A cluster may be a single candidate.

### Phase 3 — Rank and decide
Assign each cluster exactly one action (§ 4 governs the choice):

- **PROMOTE** — becomes a new permanent file. Records target path, category, and proposed status.
- **MERGE** — folds into an existing permanent file, or several sibling candidates fold into one
  new file. Records the combined result.
- **DEFER** — stays `pending`; not yet ready (an unresolved `open_question`, or a single-sighting
  Draft worth holding for recurrence). Records why and what would change the verdict.
- **REJECT** — will not be promoted. Records the reason (§ 5).

### Phase 4 — Emit the plan
Write a human-readable sweep plan (§ 3.1). In `plan` mode, **stop here.** This is the gate.

### Phase 5 — Execute *(only on an approved plan)*
For each PROMOTE/MERGE: write or update the permanent file per `AI-Memory/08_Templates/FORMATS.md`
with correct frontmatter (§ 6). Then set each entry's `status.json` (§ 5), update `INDEX.md`
(§ 6.4), and verify integrity before committing. One intentional commit, message naming the
sweep and its counts.

### 3.1 The sweep-plan artifact
Written to `AI-Memory/Inbox/_sweeps/<YYYY-MM-DD>-sweep-plan.md` (the Inbox is session-writable;
this is not permanent memory). Also presented to the operator in-conversation. One row per
cluster: candidate id(s) and source entries · proposed action · target file · proposed status ·
recurrence count · one-line reason. Merges show the combined body preview. It is a proposal a
non-author can read and approve in one pass — the BC Brain review gate, in a file.

---

## 4. The ranking rule — what earns promotion

Adapted directly from BC Brain: *"Learnings seen 2+ times become confirmed patterns; first
mentions stay emerging."* Recurrence is the primary signal; confidence and operator intent are
secondary.

| Situation | Action | Proposed status |
|---|---|---|
| Finding recurs across **2+ independent entries** | PROMOTE (or MERGE the recurrences into one) | **Validated** — recurrence is the charter's "second independent project," made concrete |
| Single sighting, `confidence: high` **or** `operator_directive: true` | PROMOTE | **Draft** |
| Single sighting, `confidence: medium/low`, no directive | DEFER (hold for recurrence) | stays `pending` |
| Duplicates something already permanent, adds nothing | REJECT (as `duplicate`) | — |
| Extends something already permanent | MERGE into it | keep or raise the existing file's status |
| `type: open_question`, unresolved | DEFER — an open question is not knowledge yet; route to the relevant `.knowledge/roadmap.md` if it belongs to a project | stays `pending` |
| No reusable basis on inspection | REJECT (as `no_basis`) | — |

**Only recurrence across independent entries may propose `Validated`.** Nothing reaches
`Best Practice` through the Promoter automatically — that is a deliberate human act recorded as a
Decision, per the charter's quality ladder. The Promoter proposes; § 2's gate disposes.

---

## 5. Rejections and status — what the Promoter owns

The Promoter owns `status.json` exclusively (§ 6). After a sweep executes, every processed
entry's `status.json` is set once, recording the outcome of each candidate in `candidate_outcomes`:

| All candidates in the entry | Entry `state` |
|---|---|
| promoted or merged | `promoted` |
| some promoted/merged, some deferred/rejected | `partially_promoted` |
| all rejected | `rejected` |
| all deferred (nothing acted on yet) | stays `pending` |

**Rejections are recorded, never silent** (operator decision, 2026-09-06). Each rejected
candidate gets an entry in `candidate_outcomes` with `outcome: rejected`, a `reason`
(`duplicate` · `no_basis` · `superseded` · `out_of_scope` · free text), and the sweep date. The
cost is a few lines per rejection; the benefit is that the same weak candidate is not re-proposed
and re-argued next sweep — the system remembers it already said no, and why.

Deferred candidates leave the entry `pending` so the next sweep re-sees them; a candidate that
has been deferred twice without gaining a recurrence is a REJECT candidate on the third sweep.

---

## 6. Interface contract with End-Session

`End-Session` (v1.0.1) guarantees the following. A change to any of these is a breaking change to
both skills.

### What the Promoter can rely on

| Guarantee | Detail |
|---|---|
| **Entry location** | `AI-Memory/Inbox/<project-slug>/<session-id>/` |
| **Required files** | `session.md`, `evidence.json`, `candidates.json`, `status.json` |
| **Optional file** | `changes.patch` — present only under End-Session § 5.3 |
| **Schema versioning** | Every JSON carries `schema_version` |
| **Immutability** | Every file except `status.json` is write-once and never changes |
| **Initial state** | `status.json.state` is always `pending` on creation |
| **Candidate identity** | Every candidate has an `id` unique within its entry |
| **Basis guarantee** | Every candidate has a non-empty `basis`; candidates without one are discarded at capture |
| **Trust levels** | `evidence.json` is machine-derived and verifiable. `candidates.json` is model-asserted — proposal only. |

### What the Promoter owns and must not do

- **Owns `status.json`, exclusively**, from the moment End-Session creates it. Valid states:
  `pending` · `in_review` · `promoted` · `partially_promoted` · `rejected` · `superseded`.
- **Owns permanent `AI-Memory/01_…10_` and `INDEX.md`** — the only skill permitted to write them.
- **Must not modify any file other than `status.json` inside an entry.** Capture is evidence;
  evidence that can be edited after the fact is not evidence.
- **Must not delete entries.** Archival is a future `Archivist` concern.
- **Must not treat `candidates.json` as authoritative.** `confidence`, `basis`, and
  `possible_duplicates` support a judgment; they do not replace one.

### 6.4 INDEX integrity
`INDEX.md` claims to list every permanent file. The Promoter is the only writer, so integrity is
its responsibility. After every `execute`: add a catalogue line for each new file, update status
where a file's status changed, and verify — every file under `01_…10_` appears in `INDEX.md`, and
every line in `INDEX.md` points at a file that exists. A mismatch aborts the commit and is
reported. The Inbox is deliberately not indexed.

### 6.5 Promotion moves, never copies
When a candidate is promoted from a project-local origin (a `promotion_request`), the project file
loses the content and gains a one-line pointer to the new global home. A fact lives in exactly one
place (charter invariant 1). Merge over append (invariant 2) is enforced here, at promotion —
End-Session only flags duplicates; the Promoter resolves them.

---

## 7. The seven questions, answered

The placeholder recorded seven open questions. BC Brain's running system answers all of them;
recorded here so the answers are visible and the questions are not reopened without cause.

1. **Draft → Validated?** Recurrence across 2+ independent entries (§ 4). BC Brain's "seen 2+
   times = confirmed pattern," made concrete.
2. **How are duplicates merged?** Human-gated, in the sweep plan (§ 3, Phase 3/5). End-Session's
   upstream `possible_duplicates` narrows the search; the Promoter proposes, the operator approves.
3. **Who is the human, and where?** The operator, at the § 2 plan→approve gate. Non-negotiable.
4. **How does INDEX stay correct?** § 6.4 — verified every execute.
5. **Rejected candidates?** Recorded with a reason in `candidate_outcomes` (§ 5). Retained, not
   dropped.
6. **Batch or per-entry?** Batch — the sweep (§ 1). Recurrence is only visible in batch.
7. **Can it request re-capture?** No. The conversation is gone by sweep time; this is a permanent
   limitation, matching BC Brain (extraction is one-shot). Under-specified candidates DEFER or
   REJECT; they cannot be sent back for more.

---

## 8. Deliberate non-goals (v1.0.0)

- **No automatic mode.** Ever. § 2.
- **No `Best Practice` promotion.** That rung is a human Decision, per the charter ladder.
- **No entry deletion or archival.** A future `Archivist` owns lifecycle after `promoted`.
- **No cross-repo or multi-project recurrence tracking beyond what the entries themselves show.**
  Recurrence is counted over the Inbox as it stands at sweep time.
- **No re-capture request path.** § 7.7.

---

*This specification replaces the 0.0.0 placeholder. The interface contract in § 6 is unchanged
from the placeholder that End-Session was built against; the rest is new, and adapted from a
system already proven in production rather than designed from first principles.*
