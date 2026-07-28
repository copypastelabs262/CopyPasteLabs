#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CopyPasteLabs — session start hook
#
# Pulls the latest from GitHub before any work begins, so a session never starts
# from a stale copy. Low stakes today (only this machine writes), but it costs
# nothing and protects the day that stops being true — a second writing machine,
# an edit made directly on github.com, or a teammate given write access.
#
# Never destructive: if the pull would conflict, it stops and says so rather
# than overwriting anything.
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

REPO="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$REPO" ] || [ ! -d "$REPO/.git" ]; then
  exit 0   # not a repo; nothing to do, and not worth interrupting the session
fi

cd "$REPO" || exit 0

# Uncommitted work present? Don't touch it — pulling on top is how people lose work.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[session-start] Uncommitted changes present — skipping pull to protect them." >&2
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
[ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ] && exit 0

if git pull --ff-only -q origin "$BRANCH" 2>/dev/null; then
  exit 0
fi

echo "[session-start] Could not fast-forward from GitHub." >&2
echo "[session-start] Either you're offline, or local and remote have diverged." >&2
echo "[session-start] If diverged, open a terminal here and run:  git pull" >&2
exit 0
