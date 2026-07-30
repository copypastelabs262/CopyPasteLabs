# End-Session — Implementation Prompt

**Implements:** `Skills/End-Session/specification.md` v1.0.0
**Prompt version:** 1.0.0

The specification is the contract. Where this prompt and the specification disagree, the
specification is correct and this prompt has a bug. Two points where exact implementation was
impossible are documented in § D at the end — read them before running.

---

## OPERATING RULES

1. Execute phases **0 → 9 in order**. Never reorder, never skip, never run a later phase after
   an earlier one aborts.
2. **Do not narrate.** No "Let me…", no phase-by-phase commentary. Run silently, then print the
   § 9 summary once.
3. **Do not improvise.** If a rule below does not cover the situation, ABORT and report. Never
   invent behaviour.
4. Every abort prints: `ABORT [phase N] <reason>` then the recovery line from § R. Then stop.
5. All shell commands run from `$CLAUDE_PROJECT_DIR`. Use absolute paths.
6. All timestamps are ISO-8601 UTC, `Z`-suffixed: `date -u +%Y-%m-%dT%H:%M:%SZ`.
7. All JSON: 2-space indent, keys in the exact order given in § S, arrays sorted as specified.
   Determinism is a requirement, not a preference (Success criterion re-derivation).
8. Never run `git add -A`. Stage only explicit paths. See Phase 8.
9. Never write outside the allowlist in Phase 8. There is no override flag.

**Inputs** (all optional, default in brackets): `project` [auto], `topic` [derived],
`dry-run` [false], `no-push` [false], `no-project-docs` [false], `force` [false], `note` [none].

**Constants:**
```
DIFF_INLINE_MAX_BYTES = 262144
DIFF_INLINE_MAX_FILES = 200
LOCK_STALE_MINUTES    = 30
MARKER_STALE_HOURS    = 24
RESERVED_SLUG         = _platform
```

---

## PHASE 0 — PRECONDITIONS

Run this block. Any `FAIL` aborts immediately with no writes.

```bash
cd "$CLAUDE_PROJECT_DIR" || { echo "FAIL p0.1 CLAUDE_PROJECT_DIR unset/unusable"; exit 1; }
[ -d .git ] || { echo "FAIL p0.1 not a git repository"; exit 1; }
git rev-parse HEAD >/dev/null 2>&1 || { echo "FAIL p0.2 repository has zero commits"; exit 1; }
B=$(git rev-parse --abbrev-ref HEAD)
[ "$B" = "HEAD" ] && { echo "FAIL p0.3 detached HEAD"; exit 1; }
for m in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD BISECT_LOG; do
  [ -e ".git/$m" ] && { echo "FAIL p0.4 operation in progress: $m"; exit 1; }
done
[ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] && { echo "FAIL p0.4 rebase in progress"; exit 1; }
git grep -lE '^(<{7}|={7}|>{7})( |$)' -- . 2>/dev/null | head -1 | grep -q . \
  && { echo "FAIL p0.5 conflict markers in tracked files"; exit 1; }
[ -d AI-Memory ] || { echo "FAIL p0.6 AI-Memory/ missing — not a BuilderOS repository"; exit 1; }
echo "PRE_RUN_SHA=$(git rev-parse HEAD)"
git status --porcelain > /tmp/es_predirty.txt
echo "p0 OK branch=$B"
```

Record two values for later phases:

- **`PRE_RUN_SHA`** — HEAD before any End-Session write. Used by Phase 8 and Success
  criterion 5.
- **`PRE_DIRTY`** — the paths in `/tmp/es_predirty.txt`. These are the operator's pre-existing
  uncommitted changes. Phase 8 **excludes** them from the gate; they are not End-Session's
  writes. Edge case 12.3: record them, never commit them.

Precondition 7 (lock) is Phase 1.

---

## PHASE 1 — ACQUIRE LOCK

```bash
mkdir -p AI-Memory/Inbox
LOCK=AI-Memory/Inbox/.lock
if [ -f "$LOCK" ]; then
  LOCK_AGE=$(( ( $(date -u +%s) - $(date -u -r "$LOCK" +%s 2>/dev/null || echo 0) ) / 60 ))
  if [ "$LOCK_AGE" -lt 30 ]; then
    echo "FAIL p1 lock held: $(cat "$LOCK") — age ${LOCK_AGE}m"; exit 1
  fi
  echo "WARN p1 breaking stale lock (age ${LOCK_AGE}m): $(cat "$LOCK")"
fi
printf 'pid=%s started=%s\n' "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOCK"
```

**Release the lock on every exit path**, success or failure: `rm -f AI-Memory/Inbox/.lock`.
If any later phase aborts, delete the lock before printing the abort message.

If `AI-Memory/Inbox/` did not already exist, also create `README.md` and `_schema/` in it
(edge case 12.19). Contents in § S.5.

---

## PHASE 2 — SESSION BOUNDARY

`head` = `git rev-parse HEAD`.

Determine `base` by the **first** strategy that yields a commit. Record which one in
`base_strategy` verbatim:

| Order | Strategy value | How |
|---|---|---|
| 1 | `previous_inbox_entry` | Newest directory under `AI-Memory/Inbox/<primary-slug>/` by name sort; read its `evidence.json` → `.session_boundary.head`. Requires Phase 3 first — see note. |
| 2 | `session_start_marker` | Only if `.claude/.session-start` contains a 40-hex SHA. It currently does not (§ D.2); this strategy will not fire. |
| 3 | `upstream_merge_base` | `git merge-base HEAD origin/<branch>` |
| 4 | `root_commit` | `git rev-list --max-parents=0 HEAD \| tail -1` |

**Ordering note:** strategy 1 needs the project slug, which Phase 3 produces. Resolve by
running Phase 3's path-attribution against the range `<strategy-3-or-4-base>..HEAD` first,
then re-deriving `base` via strategy 1 once the slug is known, then recomputing Phase 4
evidence against the final range. Do not skip the recomputation — evidence must match the
final recorded range exactly (Success criterion 4).

If `base == head`, there are no commits in range. Continue; `commits` will be `[]`
(edge case 12.2).

Set `base_source` to the file path used for strategy 1, otherwise `null`.

---

## PHASE 3 — IDENTIFY PROJECT

Apply in order, first match wins. Record the winning rule in `project.primary_detection`.

1. **`explicit_override`** — `project` input supplied. Validate it against declared slugs:
   ```bash
   grep -h '^slug:' Projects/*/.knowledge/project.md | sed 's/^slug:[[:space:]]*//'
   ```
   Unknown slug → `ABORT [phase 3] unknown project slug '<x>'`. Never create a project.

2. **`changed_path_attribution`** — group changed paths by `Projects/<dir>/` prefix, map each
   directory to its **declared slug** from `<dir>/.knowledge/project.md` frontmatter. Most
   changed files wins. Others become `secondary`, sorted alphabetically.
   A project directory with no `slug:` → `ABORT [phase 3] Projects/<dir> has no declared slug`.

3. **`tie_break_lines`** — equal file counts: most changed lines wins.

4. **`tie_break_alphabetical`** — still tied: alphabetically first slug.

5. **`platform`** — no changed path under `Projects/` → primary = `_platform`.

6. No changes and no candidates → Phase 12.1 (exit 0, write nothing).
   No changes but candidates exist → use `project` input; if absent, `_platform`.

Slugs are read from frontmatter only. **Never infer a slug from a directory name.**

---

## PHASE 4 — GATHER EVIDENCE

Purely mechanical. **No model judgment enters this phase.** Every field must be re-derivable
from git; if it cannot be, it does not belong in `evidence.json`.

```bash
BASE=<base>; HEAD=<head>
git log --format='%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e' "$BASE..$HEAD"
git diff --name-status -M -C "$BASE..$HEAD"
git diff --numstat "$BASE..$HEAD"
git status --porcelain
git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null
git rev-list --left-right --count "$HEAD...@{upstream}" 2>/dev/null
git diff "$BASE..$HEAD" | wc -c
```

Rules:

- `-M -C` are **mandatory**. Without them a rename is recorded as an unrelated delete + add,
  which misrepresents the work.
- `change_type` maps: `M`→`modified`, `A`→`added`, `D`→`deleted`, `R*`→`renamed` (set
  `renamed_from` and `similarity`), `C*`→`copied`.
- Binary files: `numstat` gives `-` for insertions/deletions. Set `binary: true`,
  `insertions: 0`, `deletions: 0`, and add the path to `diff.binary_files`.
- `files[]` sorted by `path` ascending, byte order. Non-UTF-8 paths recorded escaped, never
  dropped.
- `working_tree` lists the operator's uncommitted/staged/untracked paths (excluding ignored).
  Record them; **do not commit them** (12.3). Warn in the Phase 9 summary if non-empty.
- `summary` counts must equal `len(files)` grouped by `change_type` (Success criterion 4).

**Duration** (§ 4.3):
```bash
M=.claude/.session-start
if [ -f "$M" ] && head -1 "$M" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'; then
  S=$(date -u -d "$(head -1 "$M")" +%s); N=$(date -u +%s); MIN=$(( (N-S)/60 ))
  [ "$MIN" -gt 1440 ] && SRC=marker_stale || SRC=session_start_marker
  echo "duration_known=true minutes=$MIN source=$SRC"
else
  echo "duration_known=false minutes=null source=unavailable"
fi
```
A missing marker is **not an error** (12.14).

**Secret scan** (12.18) — run before the diff decision:
```bash
git diff --name-only "$BASE..$HEAD" \
  | grep -iE '(\.env($|\.)|\.pem$|\.key$|\.p12$|\.pfx$|credential|secret|token|apikey|api_key)'
```
Any match: set `diff.stored = false`, `omitted_reason = "secret_suspected"`, list the paths in
`diff.secret_suspected_paths`, and add to Phase 9 warnings:
`SECRET SUSPECTED in <paths> — already in git history; rotate the credential now.`
Do **not** attempt to hide or redact. The content is already committed; the priority is
alerting the operator, not concealing it.

**Diff policy** (§ 5.3) — store `changes.patch` if and only if all four hold:
size ≤ 262144 **and** zero binary files **and** file count ≤ 200 **and** no secret suspected.
Otherwise omit it and set `omitted_reason` to exactly one of
`size_exceeded` | `binary_present` | `file_count_exceeded` | `secret_suspected`, plus
`regenerate_command: "git diff <base_short>..<head_short>"`.

**Clock check** (12.20): if the new session id sorts lexically before the newest existing
entry for this project, emit `WARN p4 clock skew: new session id sorts before existing entry`.
Record system time as-is; never invent a timestamp.

---

## PHASE 5 — EXTRACT CANDIDATES

The only phase containing model judgment. Everything produced here is an **assertion** and
goes in `candidates.json`, never in `evidence.json`.

**Types:** `learning` `principle` `pattern` `prompt` `snippet` `mistake` `decision` `tool`
`glossary` `open_question`. Plus `promotion_request` and `demotion_request` when the operator
issued "Promote this" / "Demote this" during the session.

**The fabrication guard is absolute:**

- Every candidate MUST have a non-empty `basis` naming the specific thing that happened — a
  failure, a measurement, a decision, a piece of code. Not a topic; an event.
- If you can state the claim but not its basis, **discard it**. It is a generality, not a
  finding.
- **Zero candidates is a valid, successful run.** Never manufacture a candidate to make an
  entry look substantial.
- Record every discard in `extraction_meta.candidates_discarded_no_basis` (count) and name
  them in `extraction_meta.note`.
- Expected volume: **0–5**. If you have more than 8, you are capturing discussion rather than
  findings — re-apply the guard before writing.

**Defaults:** `proposed_status` = `Draft` always. Nothing may enter at `Validated` or above on
one session's evidence. `proposed_scope` = `project` when unsure.
`promoter_notes` = `""` always — the Promoter writes there, not you.

**Duplicate hints:** read `AI-Memory/INDEX.md` and the `01_`–`10_` directories (**read only**)
and populate `possible_duplicates` with suspected overlapping paths. **Flag; never merge.**

**Operator directives:** if the operator said "Learn from this" / "Remember this", set
`confidence: high` and `operator_directive: true` on that candidate. Never ask whether to save.

**`id`** = `cand-001`, `cand-002`, … in emission order, zero-padded to 3.

---

## PHASE 6 — WRITE INBOX ENTRY

**Session id:** `<YYYY-MM-DD>T<HHMM>Z-<topic-slug>` — UTC, no colons (Windows), topic-slug
lowercase-hyphenated ASCII ≤ 40 chars.

**Target:** `AI-Memory/Inbox/<primary-slug>/<session-id>/`

If the target exists: without `force` → `ABORT [phase 6] entry already exists` (12.4).
With `force` → append `-r2`, `-r3`, … **Never overwrite. Never modify an existing entry.**

**Write atomically** (12.21):

```bash
TMP="AI-Memory/Inbox/<slug>/.tmp-<session-id>"
mkdir -p "$TMP"
# write session.md, evidence.json, candidates.json, status.json, [changes.patch] into $TMP
mv "$TMP" "AI-Memory/Inbox/<slug>/<session-id>"
```

A partial entry must never be observable. On any failure inside this phase:
`rm -rf "$TMP"`, release lock, abort.

`status.json` is written **once**, with `state: "pending"`. Never write it again, including
on `force` re-runs.

If `dry-run`: print the full intended file contents and paths, write nothing, release lock,
exit 0.

---

## PHASE 7 — PROJECT DOCUMENTS

Skip entirely if `no-project-docs`, or if primary slug is `_platform`.

Write **exactly two files. No others.**

1. `Projects/<slug>/.knowledge/sessions/<YYYY-MM-DD>-<topic-slug>.md` — create. If it exists,
   append `-2`, `-3`, … Never overwrite. Sections per
   `Projects/_TEMPLATE/.knowledge/sessions/README.md`. Must include a link to the Inbox entry.

2. `Projects/<slug>/.knowledge/progress.md` — **prepend** one entry immediately after the file
   header, before the newest existing `## ` heading. The file is newest-first; appending
   silently corrupts the ordering. Format: `## YYYY-MM-DD — <topic>` then
   `**Done:** / **In progress:** / **Blocked:** / **Next:**`.

**Forbidden in this phase and everywhere else:** `project.md`, `architecture.md`,
`requirements.md`, `roadmap.md`, `decisions.md`, `domain-model.md`, `constitution.md`,
`research/`, and every other project file. A decision is captured as a **candidate**; writing
it into `decisions.md` is a deliberate human act, not a side effect of closing a session.

---

## PHASE 8 — THE GATE

Stage **only** End-Session's own writes. Never `git add -A`.

```bash
git add AI-Memory/Inbox/
[ -n "<slug>" ] && [ "<slug>" != "_platform" ] && \
  git add "Projects/<slug>/.knowledge/sessions/" "Projects/<slug>/.knowledge/progress.md"
```

Then verify. The gate checks the union of (a) currently staged paths and (b) paths committed
since `PRE_RUN_SHA` — the latter catches anything `scripts/autosave.sh` committed mid-run
(§ D.1) — **minus** `PRE_DIRTY`, the operator's pre-existing changes.

```bash
{ git diff --cached --name-only; git diff --name-only "$PRE_RUN_SHA"..HEAD; } \
  | sort -u > /tmp/es_touched.txt
sed 's/^...//' /tmp/es_predirty.txt | sort -u > /tmp/es_pre.txt
comm -23 /tmp/es_touched.txt /tmp/es_pre.txt > /tmp/es_gate.txt

VIOLATIONS=$(grep -vE "^(AI-Memory/Inbox/|Projects/<slug>/\.knowledge/sessions/|Projects/<slug>/\.knowledge/progress\.md$)" /tmp/es_gate.txt || true)
if [ -n "$VIOLATIONS" ]; then
  git reset -q
  echo "ABORT [phase 8] write allowlist violated:"; echo "$VIOLATIONS"
  rm -f AI-Memory/Inbox/.lock
  exit 1
fi
```

**Additionally verify Success criterion 5 — permanent memory untouched:**

```bash
git diff --quiet "$PRE_RUN_SHA" -- \
  AI-Memory/01_* AI-Memory/02_* AI-Memory/03_* AI-Memory/04_* AI-Memory/05_* \
  AI-Memory/06_* AI-Memory/07_* AI-Memory/08_* AI-Memory/09_* AI-Memory/10_* \
  AI-Memory/INDEX.md \
  || { git reset -q; echo "ABORT [phase 8] permanent AI-Memory modified"; rm -f AI-Memory/Inbox/.lock; exit 1; }
```

**This gate has no override flag and no `force` bypass.** A gate failure is a defect in the
skill, not a condition to retry around. Do not auto-retry. Report and stop.

---

## PHASE 9 — COMMIT, PUSH, REPORT

```bash
git commit -q -F - <<EOF
Session capture: <slug> — <topic>

<one-line summary of what the session accomplished>

Inbox: AI-Memory/Inbox/<slug>/<session-id>/
Candidates: <n> (<type breakdown, e.g. 1 learning, 1 decision, 1 open question>)
Commits captured: <base_short>..<head_short>
EOF
```

If nothing is staged because `autosave.sh` already committed the files (§ D.1), skip the
commit and note `commit: skipped (already committed by autosave)` in the summary. Do **not**
use `--allow-empty`.

Push unless `no-push`:
```bash
git push -q origin "$(git rev-parse --abbrev-ref HEAD)" || {
  echo "PUSH FAILED — entry is committed locally but NOT on GitHub."
  echo "Shiv and Darsh will not see it. Fix: git pull && git push"
  PUSH_STATUS=failed
}
```
Push failure is **non-fatal to the artifacts** but sets a non-zero exit code (12.12).

Release the lock: `rm -f AI-Memory/Inbox/.lock`.

**Print exactly this summary and nothing else:**

```
END-SESSION COMPLETE

Entry      AI-Memory/Inbox/<slug>/<session-id>/
Project    <slug>  (detection: <primary_detection>)  [secondary: <list or none>]
Range      <base_short>..<head_short>  (base: <base_strategy>)
Files      <n> modified, <n> added, <n> deleted, <n> renamed  (+<ins> −<del>)
Diff       stored | omitted (<reason>)
Candidates <n>  — <n> learning, <n> decision, <n> open_question, …  (<n> discarded, no basis)
Duration   <n> min (<source>) | unknown
Project    sessions/<file>.md (new), progress.md (updated) | skipped (<reason>)
Commit     <sha-short> | skipped
Push       ok | FAILED
Warnings   <list or none>
```

---

## SUCCESS CRITERIA — verify before printing the summary

All ten must hold. Any failure aborts.

| # | Check |
|---|---|
| 1 | Entry directory exists at the expected path |
| 2 | `session.md`, `evidence.json`, `candidates.json`, `status.json` all present |
| 3 | All three JSON files parse and carry `schema_version: 1` |
| 4 | `len(evidence.changes.files)` equals `git diff --name-status -M -C base..head \| wc -l` |
| 5 | `git diff PRE_RUN_SHA -- AI-Memory/0*/ AI-Memory/10_*/ AI-Memory/INDEX.md` is empty |
| 6 | Gate passed with zero violations |
| 7 | Every candidate has a non-empty `basis` |
| 8 | Exactly one commit created, or commit correctly skipped per § D.1 |
| 9 | Push succeeded, or failure reported loudly with non-zero exit |
| 10 | `status.json.state == "pending"` |

---

## § E — EDGE CASE TRACEABILITY

Every case in specification § 12, and where this prompt handles it. Audit this table when
changing any phase.

| Spec | Case | Handled in |
|---|---|---|
| 12.1 | Nothing changed, no candidates | Phase 3 rule 6 — exit 0, write nothing |
| 12.2 | Nothing changed, candidates exist | Phase 2 — `commits: []`, entry still written |
| 12.3 | Uncommitted changes at session end | Phase 0 `PRE_DIRTY`; Phase 4 `working_tree`; Phase 8 exclusion |
| 12.4 | Entry already exists | Phase 6 — refuse, or `-r2` under `force` |
| 12.5 | Multiple projects touched | Phase 3 rule 2 — primary + `secondary[]`, one entry only |
| 12.6 | No project identifiable | Phase 3 rule 5 — `_platform`; Phase 7 skipped |
| 12.7 | Concurrent run | Phase 1 — lock, 30-min staleness |
| 12.8 | Diff exceeds cap | Phase 4 — `size_exceeded` |
| 12.9 | Binary files changed | Phase 4 — `binary: true`, `binary_present` |
| 12.10 | Detached HEAD | Phase 0 check 3 — abort |
| 12.11 | Merge/rebase in progress | Phase 0 check 4 — abort |
| 12.12 | Push fails | Phase 9 — loud, non-fatal, non-zero exit |
| 12.13 | Zero commits in repo | Phase 0 check 2 — abort |
| 12.14 | Marker missing | Phase 4 duration — `duration_known: false`, not an error |
| 12.15 | Marker stale > 24h | Phase 4 duration — `marker_stale` |
| 12.16 | Context truncated | Phase 5 — `context_completeness: partial`, high-confidence only |
| 12.17 | Project renamed mid-session | Phase 3 — slug from frontmatter, never the directory |
| 12.18 | Secret detected | Phase 4 secret scan — suppress patch, warn loudly |
| 12.19 | `Inbox/` does not exist | Phase 1 — create with `README.md` + `_schema/` (§ S.5) |
| 12.20 | Clock skew | Phase 4 clock check — warn, record time as-is |
| 12.21 | Disk full mid-write | Phase 6 — atomic rename; `rm -rf $TMP` on failure |

---

## § R — ABORT AND RECOVERY

| Class | Trigger | Action | Recovery line to print |
|---|---|---|---|
| Precondition | Phase 0, 1 | Abort, zero side effects | `Fix the reported condition and re-run.` |
| Detection | Phase 2, 3 | Abort, no writes. **Never guess.** | `Supply --project <slug> to disambiguate.` |
| Write | Phase 6, 7 | `rm -rf $TMP`, abort | `No partial entry was created. Re-run.` |
| Invariant | Phase 8 | `git reset`, abort | `Entry is in the working tree, uncommitted. Inspect the listed paths; do NOT re-run until the cause is understood.` |
| Push | Phase 9 | Non-fatal | `Artifacts are committed locally. Run: git pull && git push` |

Release the lock on every path above.

**Degrade toward "no entry", never "wrong entry."** Every failure ends in either a complete
valid entry or none at all.

---

## § S — ARTIFACT SCHEMAS

Emit these shapes exactly. Key order as listed. See `examples/` for filled instances.

**S.1 `evidence.json`** — top-level keys in order:
`schema_version`(1) · `generated_by`("End-Session/1.0.0") · `generated_at` · `producer`("claude") ·
`author`(null) · `session`{id, topic_slug, started_at, ended_at, duration_known,
duration_minutes, duration_source, context_completeness, operator_note} ·
`project`{primary, primary_detection, secondary[], secondary_reason} ·
`repo`{name, remote, branch, upstream, ahead, behind} ·
`session_boundary`{base, base_short, base_strategy, base_source, head, head_short} ·
`commits`[{sha, short, author_name, author_email, authored_at, subject, body, is_auto_save}] ·
`changes`{summary{modified,added,deleted,renamed,copied,total_files,insertions,deletions},
files[{path, change_type, renamed_from?, similarity?, insertions, deletions, binary}]} ·
`working_tree`{clean, uncommitted[], staged[], untracked[]} ·
`diff`{stored, path, size_bytes, omitted_reason, binary_files[], regenerate_command} ·
`related_sessions`[]

`is_auto_save` = subject starts with `Auto-save:`.

**S.2 `candidates.json`:**
`schema_version` · `generated_by` · `generated_at` · `session_id` · `project` ·
`extraction_meta`{context_completeness, candidates_emitted, candidates_discarded_no_basis, note} ·
`candidates`[{id, type, title, body, confidence, basis, evidence_refs[], proposed_scope,
proposed_status, possible_duplicates[], promoter_notes}]
Add `operator_directive: true` only when the operator explicitly commanded capture.

**S.3 `status.json`:**
`schema_version` · `session_id` · `project` · `state`("pending") · `state_set_at` ·
`state_set_by` · `review`{reviewed_at:null, reviewed_by:null, candidate_outcomes:[], notes:""}

**S.4 `session.md`** — YAML frontmatter `project, session_id, schema_version, generated_by,
generated_at`, then `# <date> — <topic>` and these H2 sections **in order, all mandatory**:
`Starting state` · `What was done` · `Decisions made` · `Problems hit` ·
`Unresolved questions` · `Ending state` · `Next session should start with`.
Empty `Unresolved questions` is written as `None identified.` — silence is ambiguous.

**S.5 First-run scaffolding** (12.19) — when creating `AI-Memory/Inbox/` write
`README.md` stating: the Inbox is staging not knowledge, entries are write-once except
`status.json`, `Knowledge-Promoter` owns promotion, and pointing to
`Skills/End-Session/specification.md`. Create `_schema/` containing
`evidence.v1.schema.json`, `candidates.v1.schema.json`, `status.v1.schema.json` derived from
S.1–S.3.

---

## § D — DEVIATIONS REQUIRING A SPEC AMENDMENT

Two points where the specification cannot be implemented exactly as written. Behaviour below
was **not invented** — each states the conflict and takes the most conservative reading. Both
need a spec patch; neither blocks running the skill.

### D.1 — `scripts/autosave.sh` races Phase 6–9

The repository's `PostToolUse` hook runs `git add -A && git commit && git push` after **every**
Write/Edit. End-Session writes 4–5 files in Phase 6 and 2 more in Phase 7, so the hook fires
mid-run. Three consequences the specification does not address:

1. Files are committed piecemeal with `Auto-save:` messages before Phase 9's intentional commit.
2. `git add -A` sweeps in the operator's uncommitted work, violating edge case 12.3.
3. Phase 9 may find nothing staged, because the hook already committed it.

**Implemented behaviour:** the Phase 8 gate validates the union of staged paths *and* paths
committed since `PRE_RUN_SHA`, minus `PRE_DIRTY`. This enforces the same invariant regardless
of who committed. Phase 9 skips its commit when nothing is staged rather than using
`--allow-empty`.

This preserves the invariant but not the clean history the spec assumes. **Consequence 2 is
not fully solvable from inside the skill** — the hook commits the operator's work before
End-Session can object. Proper fix: suppress the hook for the duration of an End-Session run,
which requires a change to `.claude/settings.json`, outside this skill's allowlist.

### D.2 — `context_completeness` violates the evidence/assertion split

§ 7.3 places `context_completeness` in `evidence.json`. But § 5.2 states `evidence.json`
contains "no model opinion whatsoever" and must be byte-identically reproducible on
re-derivation. `context_completeness` is a model self-assessment: it is an assertion, it is not
derivable from git, and a re-run could produce a different value. It cannot satisfy both rules.

**Implemented behaviour:** written to both locations, matching `examples/`, because the spec is
authoritative and § 7.3 names `evidence.context_completeness` explicitly. Consequence:
Success criterion 4's re-derivation guarantee does not hold for this one field.

**Recommended fix (spec v1.0.1):** move it to `candidates.extraction_meta` only, where
assertions belong, and exempt nothing from reproducibility.

Also note: Claude cannot reliably detect its own context truncation. Report
`complete` only when the whole session is genuinely recallable; prefer `partial` when uncertain,
and under `partial` emit high-confidence candidates only.
