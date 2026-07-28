# 2026-07-28 — Collaboration model for three founders

## Starting state
BuilderOS v1.0 scaffolded earlier the same day. Between sessions, the repo had been
initialised, pushed to `github.com/copypastelabs262/CopyPasteLabs`, given a `TEAM.md`, and
fitted with a `PostToolUse` hook that auto-committed and pushed on every edit.

Question raised: three founders (Shyam, Shiv, Darsh) share one Claude account, work on three
separate machines, and cannot see each other's chat sessions. How do they stay in sync?

## Work done

**Diagnosis.** Chat sync is the wrong target — a transcript is not shared state. The
repository already *was* the shared state; what was missing was a protocol around it.

Reviewing the existing hook surfaced four defects, all severe under a multi-writer model:
hardcoded `E:/CopyPasteLabs` (fails on the other two machines), `2>/dev/null` (a failed push
is indistinguishable from a successful one), `git add -A` with a `.gitignore` containing one
line (would eventually push a `.env`), and timestamp-only commit messages.

**The facts then changed.** Shiv and Darsh will not write to the repository at all — they
read for context, think about architecture, and hand designs back for implementation here.
That inverted the hook recommendation: removal had been the right call for three writers, and
was the wrong call for one. Reversed it explicitly rather than quietly.

**Changes made.**
- `.gitignore` — one line to a full ruleset, secrets first.
- `scripts/autosave.sh` — replaces the inline hook. Secret guard, `$CLAUDE_PROJECT_DIR`,
  branch detection, file-named commit messages, loud failures.
- `scripts/session-start.sh` — pulls on session start; refuses to run over uncommitted work.
- `.claude/settings.json` — points at both scripts.
- `README.md` — new. Human orientation, written for Shiv and Darsh.
- `TEAM.md` — added §0 (who writes, why, and when to abandon it) and §5 (shared account).
- `CLAUDE.md` — session protocol now covers pull, GitHub Issues, and a real commit at the end.

## Decisions made
Two, both in `decisions.md`: the single-writer model, and keeping auto-push but making it
fail loudly.

## Learnings captured
None promoted to `AI-Memory` yet. The single-writer model is a live bet, not a validated
practice — it has been in effect for zero days. Promote it only if it survives a real project,
and record it as a Mistake if the bottleneck bites first. Writing it up as a global Pattern
today would be recording a hypothesis as a finding.

## Mistakes hit
Testing the secret guard meant creating `my_api_key.txt` and `.env` inside the repo. Both
worked as intended — but the mount refused deletion, and the file matching the guard's own
pattern would have blocked every subsequent auto-save until removed. A test fixture disabled
the thing it was testing.

Cleaned up after requesting delete permission (which also removed two stray symlinks left
over from the bootstrap session). **Lesson: test a destructive guard on a scratch copy, not
in the live repo.** Not written up as a formal Mistake entry — it is an environment quirk
rather than a reusable prevention, and over-capture is its own failure.

Separately: two bugs in the commit-message builder, both caught by unit-testing the string
join rather than by reading it. `paste -sd ', '` cycles delimiters instead of using both
(`a,b c`), and `tr '\n' '\x01'` fails silently because `tr` has no `\xNN` escape and reads a
literal `x`. Settled on `awk`. Both are recorded as comments in `autosave.sh` so the next
person doesn't retry either.

## Ending state
Single-writer model documented and in force. Hooks rewritten and tested — the secret guard
blocks correctly, the message builder is verified across 1/2/3/5-file cases, and push failure
is loud. Push could not be verified end-to-end from this environment (no network egress to
GitHub); the commit succeeded and is queued locally.

## Next session should start with
Confirming the push actually landed — run `git log --oneline -5` on GitHub and check the
`Auto-save:` commits are there. Then define what the product actually is: every knowledge
file still says `<Project Name>`. The collaboration machinery is now ahead of the thing it
exists to build, which is the wrong way round. Pick the project, fill in
`Projects/<name>/.knowledge/project.md`, and get Shiv and Darsh their first issues to write.
