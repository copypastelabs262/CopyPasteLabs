# End-Session — Engineering Specification

| | |
|---|---|
| **Skill** | `End-Session` |
| **Spec version** | 1.0.0 |
| **Status** | Approved for implementation |
| **Owner** | CopyPasteLabs / BuilderOS |
| **Created** | 2026-07-29 |
| **Updated** | 2026-07-29 |
| **Implements** | `CLAUDE.md` § "End of every session" |
| **Downstream consumer** | `Skills/Knowledge-Promoter/` |

---

## 0. Prerequisites

Four one-time setup items this specification depends on. **Three are currently unmet** —
verified against the repository on 2026-07-29. None is implementation work; all are repo
configuration that must exist before the skill can be built.

| # | Prerequisite | Why | Status |
|---|---|---|---|
| 0.1 | `scripts/session-start.sh` writes an ISO-8601 UTC timestamp to `.claude/.session-start` | Session duration cannot be recovered after the fact (§ 4.3) | ❌ **Unmet** |
| 0.2 | `.claude/.session-start` listed in `.gitignore` | Machine-local marker; must never be committed | ❌ **Unmet** |
| 0.3 | Every `.knowledge/project.md` declares `slug:` in frontmatter | Project identity must be declared, not inferred from directory names (§ 6.2, A3) | ❌ **Unmet** — none of the three projects has one |
| 0.4 | `AI-Memory/INDEX.md` carries a human-authored line noting `Inbox/` exists and is intentionally unindexed | End-Session cannot add this itself without violating its own allowlist (§ 10.3) | ❌ **Unmet** |
| 0.5 | `TEAM.md` prohibits force-pushing to the main branch | Diff regeneration (§ 5.3) depends on commit reachability (A5) | ✅ Met |
| 0.6 | `git` ≥ 2.23 for rename detection (A9) | `-M`/`-C` flags | ✅ Met — 2.34.1 |

Prerequisite 0.3 is the one with a design consequence rather than a mechanical one: until
slugs are declared, project identification falls back to directory names, and a directory
rename silently orphans a project's session history.

---

## 1. Purpose

End-Session records what happened during a work session, as evidence, in a form a future
reader or a curation pass can trust.

It runs at the close of every session. It is the mechanism by which a conversation — which is
ephemeral, unsearchable, and invisible to the two founders who were not in it — becomes a
durable artifact in the repository.

### 1.1 What it is

A **capture** step. It observes, records, and files. It makes no permanent knowledge claims.

### 1.2 What it is not

It is **not** curation. It does not decide what is a Learning, does not promote anything into
permanent knowledge, and does not judge quality. That is `Knowledge-Promoter`'s job, and the
separation is the point (see `Skills/README.md` § "The capture/curation split").

It is also not a substitute for thinking during the session. A skill that runs at the end
cannot recover reasoning that was never articulated.

---

## 2. Design principles

These govern every decision in this document. Where a later section seems to conflict with
one of these, the principle wins and the section is a defect.

### P1 — Evidence and assertion are different things, and must never share a file

Some of what End-Session records is **evidence**: derived mechanically from git, verifiable,
and reproducible. Anyone can re-derive it and get the same answer.

The rest is **assertion**: derived from the model's reading of a conversation that no longer
exists. It cannot be verified, cannot be reproduced, and degrades with context length.

Both are worth recording. Confusing them is dangerous. In three years, a reader must be able
to tell at a glance whether they are looking at a fact or an opinion. Therefore evidence and
assertions live in **separate files with separate schemas**, and the Promoter treats them with
different levels of trust.

This is the single most important idea in this specification.

### P2 — Capture must be cheap enough to never skip

Any friction at session end gets skipped, and it gets skipped first on long, messy, valuable
sessions. End-Session must require no decisions from the operator in the normal case.

### P3 — Artifacts are write-once

Once written, an Inbox entry is immutable. Corrections are new entries, not edits. Only
`status.json` — owned by the Promoter, not by this skill — may change after creation.

An immutable record can be trusted. A mutable one requires knowing who changed it and when,
which is a problem this system is not built to solve.

### P4 — Fail closed, and loudly

If a precondition cannot be verified, abort and report. Never write a partial entry, and
never silently degrade. A missing Inbox entry is a visible problem; a subtly wrong one is not.

### P5 — Invariants are enforced mechanically, not documented

"Must never modify permanent knowledge" is not a rule if the only thing stopping it is prose.
§ 10 specifies a hard gate that inspects the staged file list and aborts on violation.

### P6 — Prefer omission to fabrication

Emitting zero candidates is a valid, successful outcome. Inventing a plausible-sounding
Learning to make an entry look substantial poisons the knowledge base and is worse than
capturing nothing. Every candidate must be traceable to something that actually happened.

### P7 — Optimize for the reader in three years, not the writer today

Assume the reader was not present, does not remember the project, and is deciding whether to
trust what they are reading.

---

## 3. Position in the system

```
   session work (conversation + edits)
              │
              ▼
     ┌────────────────┐
     │  End-Session   │
     └───────┬────────┘
             │
    ┌────────┼─────────────────────────────┐
    │        │                             │
    ▼        ▼                             ▼
 AI-Memory/Inbox/<project>/<session>/   Projects/<project>/.knowledge/
   session.md      (human)                 sessions/<file>.md   (created)
   evidence.json   (machine, verified)     progress.md          (appended)
   candidates.json (machine, asserted)
   status.json     (lifecycle)
   changes.patch   (optional)
             │
             ▼
   ┌────────────────────┐        writes
   │ Knowledge-Promoter │ ─────────────────► AI-Memory/01_… 10_, INDEX.md
   └────────────────────┘
```

End-Session writes to exactly two areas and nowhere else. The write allowlist in § 10.1 is
normative.

---

## 4. Inputs

### 4.1 Implicit inputs (gathered, not supplied)

| Input | Source | Required |
|---|---|---|
| Repository root | `$CLAUDE_PROJECT_DIR` | Yes |
| Git state | `git status`, `git log`, `git diff` | Yes |
| Session start time | `.claude/.session-start` (see § 4.3) | No |
| Active project | Detection algorithm, § 6.2 | Yes |
| Existing knowledge index | `AI-Memory/INDEX.md` (**read only**) | No |
| Session content | The conversation itself | Yes |

### 4.2 Explicit inputs (operator-supplied, all optional)

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `project` | string (slug) | auto-detected | Override project detection. |
| `topic` | string | derived | Short kebab-case topic for the session folder name. |
| `dry-run` | boolean | `false` | Compute and display everything; write nothing. |
| `no-push` | boolean | `false` | Commit locally, skip push. |
| `no-project-docs` | boolean | `false` | Write the Inbox entry only; skip § 8. |
| `force` | boolean | `false` | Permit a re-run for an existing session (see § 12.4). |
| `note` | string | — | Free-text framing from the operator, recorded verbatim. |

### 4.3 Session duration — making "if available" actually available

Duration cannot be recovered after the fact. It requires a marker written at session start.

**Prerequisite:** `scripts/session-start.sh` must write an ISO-8601 UTC timestamp to
`.claude/.session-start`, and `.claude/.session-start` must be listed in `.gitignore`
(machine-local, never committed).

End-Session reads that file. If it is missing, unreadable, or malformed, duration is recorded
as unknown — this is normal and not an error:

```json
{ "duration_known": false, "duration_minutes": null, "duration_source": "unavailable" }
```

If the marker is present but older than 24 hours, treat it as stale: record the duration but
set `"duration_source": "marker_stale"`. A 19-hour session is far more likely to be a marker
that was never cleared than a real work session.

---

## 5. Output specification

### 5.1 Directory structure

```
AI-Memory/
└── Inbox/
    ├── README.md                          ← the Inbox contract (created once, by hand)
    ├── _schema/
    │   ├── evidence.v1.schema.json
    │   ├── candidates.v1.schema.json
    │   └── status.v1.schema.json
    └── <project-slug>/
        └── <YYYY-MM-DD>T<HHMM>Z-<topic-slug>/
            ├── session.md
            ├── evidence.json
            ├── candidates.json
            ├── status.json
            └── changes.patch              ← conditional, see § 5.3
```

**`AI-Memory/Inbox/` is explicitly exempt** from the prohibition on writing inside
`AI-Memory/`. The Inbox is staging, not knowledge. The prohibition covers `01_Principles`
through `10_Glossary` and `INDEX.md`.

### 5.2 File-by-file

#### `session.md`

| | |
|---|---|
| **Purpose** | The human narrative. What happened, why, and what a reader needs to know. |
| **Author** | Model (assertion) |
| **Format** | Markdown with YAML frontmatter |
| **Readable by** | Humans, primarily. This is what Shiv and Darsh read. |
| **Mutability** | Write-once |

Required sections, in order:

```markdown
---
project: classmind
session_id: 2026-07-29T1432Z-asr-model-selection
schema_version: 1
generated_by: End-Session/1.0.0
generated_at: 2026-07-29T14:32:00Z
---

# <date> — <topic>

## Starting state
## What was done
## Decisions made
## Problems hit
## Unresolved questions
## Ending state
## Next session should start with
```

`Unresolved questions` is mandatory and may not be omitted. An empty one is written as
"None identified." — silence is ambiguous, an explicit "none" is not.

#### `evidence.json`

| | |
|---|---|
| **Purpose** | Everything mechanically derivable. The verifiable record. |
| **Author** | Machine (git) |
| **Format** | JSON, schema-versioned |
| **Readable by** | Machines. Tooling, the Promoter, future analytics. |
| **Mutability** | Write-once |

Contains: repository and branch state, commit range, per-file change records, timing, and
detection provenance. **Contains no model opinion whatsoever.** If a field cannot be derived
from git or the filesystem, it does not belong in this file.

Reproducibility requirement: re-running the derivation against the same commit range must
produce byte-identical output apart from `generated_at`. This is testable and should be tested.

#### `candidates.json`

| | |
|---|---|
| **Purpose** | Proposed knowledge, for the Promoter to accept, merge, or reject. |
| **Author** | Model (assertion) |
| **Format** | JSON, schema-versioned |
| **Readable by** | Machines, consumed by `Knowledge-Promoter` |
| **Mutability** | Write-once |

Every candidate is a **proposal, never a conclusion**. Each carries its own confidence, its
basis, and links to supporting evidence. See § 7.

#### `status.json`

| | |
|---|---|
| **Purpose** | Lifecycle tracking. Has this entry been reviewed? |
| **Author** | End-Session creates it; `Knowledge-Promoter` owns it thereafter |
| **Format** | JSON, schema-versioned |
| **Readable by** | Machines |
| **Mutability** | **Mutable** — the only mutable file in an entry |

Isolating mutability in one small file keeps the substantive record immutable while still
allowing the Promoter to track progress. End-Session writes it exactly once, with state
`pending`, and never touches it again — including on re-runs.

#### `changes.patch`

| | |
|---|---|
| **Purpose** | Full unified diff, when small enough to be worth storing. |
| **Author** | Machine (git) |
| **Format** | Unified diff |
| **Readable by** | Both |
| **Mutability** | Write-once |
| **Presence** | Conditional — see § 5.3 |

### 5.3 Diff storage policy (hybrid)

Per-file statistics are **always** recorded in `evidence.json`. The full patch is stored only
when cheap to store.

`changes.patch` is written if and only if **all** of:

1. Total diff size ≤ `DIFF_INLINE_MAX_BYTES` (**262 144**, i.e. 256 KiB)
2. No binary files in the change set
3. Changed-file count ≤ `DIFF_INLINE_MAX_FILES` (**200**)

Otherwise the file is omitted and `evidence.json` records why, plus the exact command to
regenerate it:

```json
"diff": {
  "stored": false,
  "omitted_reason": "size_exceeded",
  "size_bytes": 4185302,
  "regenerate_command": "git diff 4c43abc..a126882"
}
```

**Rationale.** Git already stores every diff; a copy is duplication. Duplication is acceptable
when it buys self-containment at trivial cost, and unacceptable when one dependency bump
permanently bloats a repository that must serve dozens of projects for years. The cap draws
that line.

**Why regeneration is safe:** it depends on the commits remaining reachable. `TEAM.md` § 2
already prohibits force-pushing to `main`, so this holds. If that rule is ever relaxed, this
policy must be revisited — a dependency worth recording here explicitly.

---

## 6. Workflow

Nine phases, strictly ordered. A failure in phases 0–2 aborts with no writes. A failure in
phase 6 or later requires the recovery procedure in § 13.

### Phase 0 — Preconditions

Verify, in order, aborting on the first failure:

1. `$CLAUDE_PROJECT_DIR` is set and contains `.git/`
2. Repository has at least one commit
3. `HEAD` is not detached
4. No merge, rebase, cherry-pick or bisect in progress
5. No conflict markers in tracked files
6. `AI-Memory/` exists (confirms this is a BuilderOS repository)
7. No lock held by another End-Session run (§ 12.7)

Failures here mean the repository is in a state the skill cannot reason about. Report the
specific precondition and stop.

### Phase 1 — Acquire lock

Write `AI-Memory/Inbox/.lock` containing PID and ISO-8601 UTC start time. Release in all exit
paths, including failure. Locks older than 30 minutes are stale and may be broken with a
warning.

### Phase 2 — Determine session boundaries

Establish the commit range:

- **head** = current `HEAD` SHA
- **base** = the last commit recorded by a previous End-Session run for this project, read
  from the most recent existing entry's `evidence.json`.
- If no previous entry exists, fall back in order: the marker in `.claude/.session-start` if
  it recorded a SHA; else `origin/<branch>` merge-base; else the repository root commit.

Record which strategy was used in `evidence.session_boundary.base_strategy`. **A reader must
always be able to tell how the boundary was chosen** — an inferred boundary and a recorded one
have very different reliability.

### Phase 3 — Identify the active project

See § 6.2 for the algorithm. Output: one primary project slug, plus zero or more secondary
project slugs.

### Phase 4 — Gather evidence

Purely mechanical. No model judgment.

- Commit list in range: SHA, author, date, subject, body
- Per-file changes via `git diff --name-status -M -C <base>..<head>`, capturing modified,
  added, deleted, renamed (with similarity index) and copied
- Per-file line statistics via `git diff --numstat`
- Working-tree state: uncommitted, staged, untracked (excluding ignored)
- Branch, upstream, ahead/behind counts
- Timestamps and duration (§ 4.3)
- Diff size measurement, for the § 5.3 decision

Rename detection must be enabled explicitly (`-M`). Without it, a renamed file appears as an
unrelated delete plus add, which misrepresents the work and corrupts downstream analysis.

### Phase 5 — Extract candidates

Model judgment. Governed by § 7 and by principle P6. May produce zero candidates.

Reads `AI-Memory/INDEX.md` and permanent category directories **read-only**, to populate
duplicate hints. Reading is permitted; writing is not.

### Phase 6 — Write Inbox entry

Create the session directory and write `session.md`, `evidence.json`, `candidates.json`,
`status.json`, and conditionally `changes.patch`.

Write to a temporary sibling directory first, then rename into place atomically. A partial
entry must never be observable — a half-written entry that validates against no schema is
worse than no entry at all.

### Phase 7 — Write charter-mandated project documents

Only two files, and only these two (see § 8):

- `Projects/<slug>/.knowledge/sessions/<YYYY-MM-DD>-<topic-slug>.md` — created
- `Projects/<slug>/.knowledge/progress.md` — one entry prepended

Skipped entirely when `no-project-docs` is set, or when the primary project is `_platform`.

### Phase 8 — Enforce invariants

The hard gate. Stage changes, then verify the staged path list against the allowlist in
§ 10.1. **Any** path outside the allowlist aborts the run, unstages everything, and reports
the offending paths. No exceptions, no overrides.

### Phase 9 — Commit, push, report

Single commit, message per § 9.3. Push to the current branch's upstream. Push failure is loud
and non-fatal to the artifacts (they are committed locally); exit code is non-zero. Finally,
print the operator summary (§ 11.2).

### 6.2 Project identification algorithm

Applied in order; first match wins:

1. **Explicit override.** The `project` input. Validated against existing project slugs;
   an unknown slug is an error, not a new project.
2. **Changed-path attribution.** Group all changed paths by their `Projects/<slug>/` prefix.
   The slug with the most changed files is primary; all others are secondary.
3. **Tie-break.** On an equal file count, the project with the most changed lines wins. If
   still tied, the alphabetically first slug wins — deterministic beats clever.
4. **Repository-level work.** If no changed path falls under `Projects/`, the primary project
   is the reserved slug **`_platform`**. This covers changes to `CLAUDE.md`, `TEAM.md`,
   `Skills/`, `scripts/`, and `AI-Memory/` itself.
5. **No changes at all.** If there is also nothing to capture, see § 12.1. If there are
   candidates but no file changes, the operator must supply `project`; if absent, use
   `_platform`.

**Project slugs are declared, not inferred.** Every project's `.knowledge/project.md` must
carry a `slug:` field in its frontmatter. The directory name is a convenience; the slug is
the identifier. This makes a directory rename a non-event, and any project directory lacking
a slug is a precondition failure for work on that project.

Secondary projects are recorded in the primary entry's evidence. **No duplicate entries are
written.** Cross-project sessions are common and duplicating the narrative would create two
records that drift apart. One entry, with the relationship recorded.

---

## 7. Candidate extraction

### 7.1 Candidate types

| Type | Captures | Eventual destination |
|---|---|---|
| `learning` | A reusable engineering concept | `02_Learnings/` |
| `principle` | A rule that should govern future work | `01_Principles/` |
| `pattern` | A reusable architecture or workflow | `03_Patterns/` |
| `prompt` | A prompt worth keeping | `04_Prompts/` |
| `snippet` | Reusable code | `05_Snippets/` |
| `mistake` | Something not to repeat | `06_Mistakes/` |
| `decision` | An intentional choice with trade-offs | `07_Decisions/` or project-local |
| `tool` | A tooling evaluation | `09_Tools/` |
| `glossary` | A term needing a shared definition | `10_Glossary/` |
| `open_question` | Unresolved; needs an answer before it can become anything else | — |

`open_question` is deliberately included. Unresolved questions are the most commonly lost
category of session output, and the most expensive to rediscover.

### 7.2 Required fields per candidate

| Field | Purpose |
|---|---|
| `id` | Stable within the entry (`cand-001`). Lets the Promoter reference decisions. |
| `type` | From the table above |
| `title` | One line, specific. "Whisper mishandles code-switching", not "ASR notes". |
| `body` | Enough for a reader with no session context to evaluate it |
| `confidence` | `high` \| `medium` \| `low` — the model's own assessment |
| `basis` | **What in the session supports this.** Mandatory. See § 7.3. |
| `evidence_refs` | File paths and/or commit SHAs, where applicable |
| `proposed_scope` | `global` (AI-Memory) \| `project` (.knowledge) \| `unsure` |
| `proposed_status` | Entry point on the quality ladder — normally `Draft` |
| `possible_duplicates` | Paths in AI-Memory that may already cover this |
| `promoter_notes` | Reserved, empty. The Promoter writes here, not End-Session. |

### 7.3 The fabrication guard

**A candidate without a `basis` must not be emitted.** The basis names the thing that actually
happened — a specific failure, a specific decision, a specific piece of code — that makes the
candidate true.

If the model can state a claim but cannot state its basis, the claim is a generality, not a
finding, and generalities are what make a knowledge base unsearchable. Discard it.

Additionally:

- **Long sessions degrade recall.** When session content may have been truncated, set
  `evidence.context_completeness` to `partial` and prefer high-confidence candidates only.
  An honest partial record beats a confident invented one.
- **`proposed_scope` defaults to `project`**, matching the charter's routing rule: unsure
  means store locally, promote later when a second project proves it generalizes.
- **Duplicates are flagged, never merged.** Merging is curation, and End-Session does not
  curate.

### 7.4 Volume expectations

The charter states that `IGNORE` should be the most common classification by volume. This
applies here: **a typical session should produce roughly zero to five candidates.**

An entry with twenty candidates is a signal that the extraction is capturing discussion rather
than findings, and should be treated as a defect in the skill, not a productive session.

---

## 8. Project document writes

End-Session writes exactly two project files — the two the charter mandates — and nothing else.

### 8.1 `sessions/<YYYY-MM-DD>-<topic-slug>.md`

Created, never overwritten. If the path exists, append `-2`, `-3`, … A session log is a record
of a moment and must not be silently replaced.

Content follows the existing convention in `Projects/_TEMPLATE/.knowledge/sessions/README.md`.
It may share prose with `session.md` but must include a link to the Inbox entry, so the two
records are navigable from either direction.

### 8.2 `progress.md`

One entry prepended below the file header, following the existing reverse-chronological
format (`Done` / `In progress` / `Blocked` / `Next`).

Prepending, not appending — the file is explicitly newest-first, and appending would silently
corrupt the ordering convention over time.

### 8.3 Explicitly out of scope

End-Session **must not** write to `project.md`, `architecture.md`, `requirements.md`,
`roadmap.md`, `decisions.md`, `domain-model.md`, `constitution.md`, `research/`, or any other
project file.

A decision made during a session is captured as a **candidate**, and a human or the Promoter
writes it into `decisions.md`. Architecture changes are proposed in the session log and
applied deliberately. Automatic edits to design documents are how design documents stop being
trusted.

---

## 9. Naming and folder conventions

### 9.1 Session identifier

```
<YYYY-MM-DD>T<HHMM>Z-<topic-slug>
```

Example: `2026-07-29T1432Z-asr-model-selection`

| Property | Reason |
|---|---|
| UTC, `Z`-suffixed | Unambiguous across timezones and travel |
| No `:` characters | **Colons are illegal in Windows filenames.** The primary writing machine is Windows; `14:32` would fail. |
| Lexically sortable | Chronological order for free, in any file browser or `ls` |
| Minute precision | Two sessions in one day do not collide — an existing, real occurrence in this repository |
| Topic slug | Human-scannable without opening files |

`topic-slug`: lowercase, hyphenated, ASCII, ≤ 40 characters, derived from the session's
dominant subject. Derived automatically when not supplied.

### 9.2 Project slug

Lowercase, hyphenated, ASCII, ≤ 30 characters, stable for the life of the project. Declared in
`.knowledge/project.md` frontmatter. Reserved: `_platform`. Slugs beginning `_` are reserved
for system use and may not be used by real projects.

### 9.3 Commit message

```
Session capture: <project-slug> — <topic>

<one-line summary of what the session accomplished>

Inbox: AI-Memory/Inbox/<project-slug>/<session-id>/
Candidates: <n> (<type breakdown>)
Commits captured: <base-short>..<head-short>
```

Deliberately distinct from the `Auto-save:` prefix used by `scripts/autosave.sh`, so session
boundaries are visible in `git log` at a glance.

---

## 10. Prohibitions and their enforcement

### 10.1 Write allowlist (normative)

End-Session may write **only** to paths matching:

```
AI-Memory/Inbox/**
Projects/<primary-slug>/.knowledge/sessions/**
Projects/<primary-slug>/.knowledge/progress.md
```

Everything else is forbidden. In particular, and per the brief:

```
AI-Memory/01_Principles/**      AI-Memory/06_Mistakes/**
AI-Memory/02_Learnings/**       AI-Memory/07_Decisions/**
AI-Memory/03_Patterns/**        AI-Memory/08_Templates/**
AI-Memory/04_Prompts/**         AI-Memory/09_Tools/**
AI-Memory/05_Snippets/**        AI-Memory/10_Glossary/**
AI-Memory/INDEX.md
```

### 10.2 The gate

Prose does not enforce anything (P5). Before committing, phase 8 must:

1. List staged paths (`git diff --cached --name-only`)
2. Match every path against the allowlist
3. On any violation: **abort**, unstage all, report each offending path, exit non-zero

This gate has no override flag. A skill that can be told to ignore its own safety rule does
not have a safety rule.

### 10.3 On `INDEX.md`

`AI-Memory/INDEX.md` states that every file in AI-Memory must be listed in it. The Inbox is
the deliberate exception: it is staging, not knowledge, and its contents are transient.

**Setup prerequisite:** a one-time, human-authored line in `INDEX.md` recording that
`Inbox/` exists and is intentionally unindexed. End-Session cannot add this itself — doing so
would violate its own allowlist.

### 10.4 Unresolved conflict with the charter

`CLAUDE.md` § "End of every session" currently instructs a session to write new entries
directly into `AI-Memory/02_Learnings/`, `03_Patterns/` and similar, and to
"update `AI-Memory/INDEX.md` whenever a file is added."

**This specification forbids exactly that.** The two documents disagree, and the disagreement
is structural rather than cosmetic: the charter assumes sessions write knowledge directly,
while this design routes everything through the Inbox for later curation.

The conflict is recorded here rather than resolved unilaterally, because amending the charter
is a governance decision, not an implementation detail. It **must** be settled before
End-Session is implemented — shipping a skill that contradicts the charter it claims to
implement would leave the operating system with two incompatible rules and no way to tell
which one is authoritative.

Three possible resolutions, in order of preference:

1. **Amend the charter** so end-of-session capture routes through `AI-Memory/Inbox/`, and
   direct writes to permanent folders become the exclusive province of `Knowledge-Promoter`.
   Cleanest, and consistent with the capture/curation split.
2. **Scope the charter rule to manual commands only** — "Learn from this" and "Promote this"
   write directly; automatic session-end capture goes to the Inbox. Preserves both behaviours
   at the cost of two paths into permanent knowledge.
3. **Abandon the Inbox model.** Coherent, but discards the review step that keeps unreviewed
   model assertions out of organizational doctrine.

Until this is resolved, treat the charter as authoritative and this specification as a
proposal.

---

## 11. Success criteria

### 11.1 Definition of done

A run is successful when **all** hold:

| # | Criterion | Verification |
|---|---|---|
| 1 | Entry exists at the specified path | Path check |
| 2 | All required files present | File listing |
| 3 | Every JSON validates against its schema | Schema validation |
| 4 | `evidence.json` accounts for every changed file in range | Count matches `git diff --name-status` |
| 5 | Permanent AI-Memory folders are byte-identical to pre-run | `git diff <pre-run-sha> -- AI-Memory/0*/ AI-Memory/10_*/ AI-Memory/INDEX.md` is empty |
| 6 | No staged path fell outside the allowlist | Gate passed |
| 7 | Every candidate has a non-empty `basis` | Field check |
| 8 | Exactly one commit created | `git log` |
| 9 | Push succeeded, or failure was reported loudly | Exit code and upstream state |
| 10 | `status.json` state is `pending` | Field check |

Criterion 5 is the important one, and it is fully mechanical — it should be an automated test,
not an inspection.

### 11.2 Operator summary

On success, print: entry path, project, commit range, file counts by change type, candidate
count by type, duration, push status. On failure, print the failed phase, the reason, and the
recovery step from § 13.

---

## 12. Edge cases

| # | Case | Required behaviour |
|---|---|---|
| 12.1 | Nothing changed, no candidates | Write nothing. Exit 0 with "nothing to capture." Empty entries are noise. |
| 12.2 | Nothing changed, candidates exist | **Write the entry.** A pure-discussion session that produced a decision is often the most valuable kind. `commits: []`. |
| 12.3 | Uncommitted changes at session end | Record them in `evidence.working_tree` as uncommitted. Do not commit the user's work as part of capture — that would bundle unrelated changes into a capture commit. Warn in the summary. |
| 12.4 | Entry already exists for this session id | Refuse by default (P3). With `force`, create a sibling suffixed `-r2`. Never overwrite. |
| 12.5 | Multiple projects touched | Primary + secondaries per § 6.2. One entry only. |
| 12.6 | No project identifiable | `_platform`. Skip phase 7. |
| 12.7 | Concurrent run | Lock (§ Phase 1). Second run refuses with the holder's PID and start time. |
| 12.8 | Diff exceeds cap | Stats only; record `omitted_reason` and regeneration command. |
| 12.9 | Binary files changed | List them with sizes; never inline. Suppresses `changes.patch` per § 5.3. |
| 12.10 | Detached HEAD | Precondition failure. Abort — session identity would be unreconstructable. |
| 12.11 | Merge/rebase in progress | Precondition failure. Abort. |
| 12.12 | Push fails | Artifacts are committed locally. Report loudly, exit non-zero, give the recovery command. Consistent with `scripts/autosave.sh`. |
| 12.13 | Repository has zero commits | Precondition failure. Nothing to capture against. |
| 12.14 | Session start marker missing | Not an error. `duration_known: false`. |
| 12.15 | Session start marker stale (> 24h) | Record duration, flag `duration_source: marker_stale`. |
| 12.16 | Context truncated on a long session | `context_completeness: partial`. Prefer high-confidence candidates only. |
| 12.17 | Project renamed mid-session | Slug is authoritative; directory rename is just a file change. No special handling — this is why slugs are declared. |
| 12.18 | Secret detected in changed files | Do not write `changes.patch`. Flag prominently in the summary. The content is already in git history; the priority is alerting the operator, not hiding it. |
| 12.19 | `AI-Memory/Inbox/` does not exist | Create it, with `README.md` and `_schema/`, as part of the first run. |
| 12.20 | Clock skew / non-monotonic timestamps | Record the system time as-is; never invent. If the new session id sorts before an existing one, warn — a wrong clock is a real and confusing problem. |
| 12.21 | Disk full / write failure mid-entry | Atomic rename (Phase 6) means the partial directory is never observable. Clean up the temp directory, abort. |

---

## 13. Failure handling and recovery

### 13.1 Failure classes

| Class | Examples | Behaviour |
|---|---|---|
| **Precondition** | Detached HEAD, no repo, merge in progress | Abort before any write. Zero side effects. |
| **Detection** | Ambiguous project, unknown slug override | Abort with the ambiguity spelled out. Do not guess. |
| **Write** | Disk full, permission denied | Abort, remove temp directory, report. |
| **Invariant** | Gate violation (§ 10.2) | Abort, unstage everything, report offending paths. Treat as a defect in the skill. |
| **Push** | Network, auth, non-fast-forward | Non-fatal. Artifacts committed locally. Loud report, non-zero exit. |

### 13.2 Recovery

- **Push failure** — artifacts are safe in a local commit. Resolve manually
  (`git pull` then `git push`) and re-running End-Session is unnecessary. Re-running would
  create a second entry for the same work, which § 12.4 correctly refuses.
- **Abort before phase 6** — no state was changed. Fix the reported condition and re-run.
- **Abort during phase 6** — the temp directory is removed. No partial entry exists.
- **Abort at the gate** — nothing was committed. The working tree still holds the entry; a
  human decides whether to salvage or delete it. **Do not auto-retry** — a gate failure means
  the skill tried to write somewhere forbidden, and that needs investigation, not a retry loop.

### 13.3 The system must degrade toward "no entry", never "wrong entry"

Every failure path above ends in either a complete, valid entry or no entry at all. A missing
entry is visible and recoverable by writing one. A corrupt or misleading entry silently
poisons every downstream decision that reads it.

---

## 14. Repository and git assumptions

Stated explicitly because a violated assumption is a silent defect.

| # | Assumption | If violated |
|---|---|---|
| A1 | Single git repository at `$CLAUDE_PROJECT_DIR` | Spec does not apply; see § 15 for multi-repo |
| A2 | `AI-Memory/` and `Projects/` at repository root | Detection fails |
| A3 | Every project declares a `slug:` in `project.md` | Precondition failure for that project |
| A4 | Single-writer model (`TEAM.md` § 0) | Concurrent runs; lock becomes load-bearing |
| A5 | No force-push to the main branch (`TEAM.md` § 2) | Diff regeneration (§ 5.3) may break |
| A6 | `scripts/autosave.sh` may have already committed edits | Base detection must not assume an uncommitted tree |
| A7 | Primary writing machine is Windows | Path length and illegal characters constrain naming (§ 9.1) |
| A8 | UTF-8 throughout | Non-UTF-8 paths recorded as escaped, never dropped |
| A9 | `git` ≥ 2.23 available on `PATH` | Rename detection flags unavailable |

A5 is the only assumption a policy change could quietly invalidate. It is cross-referenced in
`TEAM.md` so the dependency is visible from both directions.

---

## 15. Future extensibility

Designed for, not built now.

**Schema evolution.** Every JSON artifact carries `schema_version`. Readers must ignore unknown
fields (forward compatibility) and refuse unknown major versions (safety). New candidate types
are additive and are a minor version bump.

**Non-model producers.** `evidence.generated_by` accommodates a `producer` of `claude`,
`human`, or `ci`. A human writing an Inbox entry by hand is legitimate and should not require
schema changes.

**Multi-repository.** A `repo` field is reserved in `evidence.json`. When projects move to
separate repositories, the Inbox may become a distinct knowledge repository aggregating many
sources. Nothing in this spec forecloses that.

**Attribution.** An `author` field is reserved. Presently useless — all three founders share
one account, and `TEAM.md` § 5 records this gap — but it must exist before separate accounts
arrive, or historical entries become permanently unattributable.

**Retention and archival.** Out of scope here. Reserved: once the Promoter sets a terminal
state, a future `Archivist` skill may relocate entries to `AI-Memory/Inbox/_archive/`.
End-Session must never delete an entry.

**Analytics.** Because `evidence.json` is uniform and machine-readable, session cadence,
project velocity, and candidate yield become queryable across projects. This is a consequence
of the schema, not a feature to build now — but it is a reason to keep evidence clean of
opinion (P1).

**Cross-referencing.** A `related_sessions` field is reserved for linking an entry to prior
sessions on the same thread of work.

---

## 16. Open questions

Deliberately unresolved. Each needs evidence from real use, not more speculation now.

1. **Base-commit detection across long gaps.** If a project is untouched for months while
   others advance, does "last entry for this project" remain the right base? Probably, but
   untested.
2. **Candidate volume in practice.** § 7.4 asserts 0–5 per session from the charter's
   principles, not from data. Measure after ten real sessions and correct.
3. **Is `session.md` redundant with the project session log?** They overlap substantially. One
   may prove sufficient. Keeping both initially is the reversible choice; merging later is easy,
   splitting later is not.
4. **Should the Promoter be able to request re-capture?** If an entry is thin, there is
   currently no path back — the conversation is gone. This may simply be a permanent
   limitation worth stating rather than solving.
5. **Diff cap calibration.** 256 KiB is a considered guess. Revisit once real distribution
   data exists.

---

## 17. Implementation note

`prompt.md` does not exist yet, deliberately. This specification is the contract; the prompt is
one implementation of it. Write the spec first, review it, then implement — and when the two
disagree afterwards, the specification is correct and the prompt has a bug.
