#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CopyPasteLabs — auto-save hook
#
# Runs after every Write/Edit in Claude Code. COMMITS LOCALLY, and only that.
#
# PUBLISHING IS DELIBERATE (operator decision, 2026-09-06). This repo is
# public, and the old behaviour pushed every in-progress edit to master the
# moment it was written — mid-refactor states, unreviewed work, all of it —
# with no chance to review before it was on the internet. Checkpointing and
# publishing are different acts now:
#
#   autosave    → local commit after every edit (this hook; crash-safe history)
#   publishing  → an intentional `git push`, or End-Session's Phase 9 push,
#                 after the diff has actually been reviewed
#
# To restore the old push-every-edit behaviour for one session, set
# AUTOSAVE_PUSH=1 in the environment. Nothing does this by default.
#
# Design notes (read before changing):
#   • This is a SAFETY NET, not the main way history gets written. Real commits
#     with real messages should still be made at meaningful points. This hook
#     only catches whatever was left uncommitted.
#   • Failures are LOUD. The first version of this hook piped errors to
#     /dev/null, so a failure looked identical to success. Never silence it.
#   • It refuses to run if it sees anything that looks like a credential.
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

REPO="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$REPO" ] || [ ! -d "$REPO/.git" ]; then
  echo "[autosave] ERROR: CLAUDE_PROJECT_DIR unset or not a git repo. Nothing saved." >&2
  exit 1
fi

cd "$REPO" || { echo "[autosave] ERROR: cannot enter $REPO" >&2; exit 1; }

# ── Guard: refuse to stage anything that looks like a credential ─────────────
SUSPECT=$(git status --porcelain 2>/dev/null \
  | grep -iE '(\.env($|\.)|\.pem$|\.key$|\.p12$|\.pfx$|credential|secret|token|apikey|api_key)' \
  || true)

if [ -n "$SUSPECT" ]; then
  echo "[autosave] BLOCKED — these files look like they hold secrets:" >&2
  echo "$SUSPECT" >&2
  echo "[autosave] Nothing committed. Add them to .gitignore, then commit manually." >&2
  exit 1
fi

# ── Stage ────────────────────────────────────────────────────────────────────
git add -A || { echo "[autosave] ERROR: git add failed" >&2; exit 1; }

if git diff --cached --quiet; then
  exit 0   # nothing to do
fi

# ── Commit message: name the files, not the clock ────────────────────────────
# The "Auto-save:" prefix marks these as unreviewed. A human-written message is
# always better; this is what you get when nobody wrote one.
COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
# Joining a list with ", " is fiddlier than it looks:
#   `paste -sd ', '` treats the argument as a LIST of delimiters and cycles
#     through them, giving "a,b c".
#   `tr '\n' '\x01'` fails because tr has no \xNN hex escape — it reads a
#     literal 'x'. (Octal \001 would work; awk is clearer.)
FILES=$(git diff --cached --name-only | head -3 | sed 's|.*/||' \
        | awk '{printf "%s%s", (NR>1 ? ", " : ""), $0}')
if [ "$COUNT" -gt 3 ]; then
  MSG="Auto-save: ${FILES} +$((COUNT - 3)) more (${COUNT} files)"
else
  MSG="Auto-save: ${FILES}"
fi

git commit -q -m "$MSG" || { echo "[autosave] ERROR: commit failed" >&2; exit 1; }

# ── Publish only when explicitly asked ───────────────────────────────────────
# Default: NO push. The commit above is the checkpoint; the public repo gets
# updated by a deliberate push (or End-Session), after review. AUTOSAVE_PUSH=1
# restores the old behaviour for a session that wants it.
if [ "${AUTOSAVE_PUSH:-0}" != "1" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  AHEAD=$(git rev-list --count "origin/${BRANCH}..HEAD" 2>/dev/null || echo "?")
  echo "[autosave] committed locally (${AHEAD} unpushed commit(s) on ${BRANCH}). Publishing is deliberate: review, then git push."
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then
  echo "[autosave] ERROR: detached HEAD — committed locally, not pushed." >&2
  exit 1
fi

if ! git push -q origin "$BRANCH"; then
  echo "[autosave] ═══════════════════════════════════════════════════════" >&2
  echo "[autosave] PUSH FAILED — work is saved locally but NOT on GitHub." >&2
  echo "[autosave] Shiv and Darsh will not see this change." >&2
  echo "[autosave] Fix: open a terminal here, run  git pull  then  git push" >&2
  echo "[autosave] ═══════════════════════════════════════════════════════" >&2
  exit 1
fi

exit 0
