#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CopyPasteLabs — session start hook
#
# Two jobs, in this order:
#
#   1. Record the session start time to .claude/.session-start.
#      End-Session reads this to compute session duration. Duration cannot be
#      recovered after the fact — if the marker is not written here, it does
#      not exist. See Skills/End-Session/specification.md § 4.3.
#
#   2. Pull the latest from GitHub, so a session never starts from a stale
#      copy. Low stakes today (only this machine writes), but it costs nothing
#      and protects the day that stops being true — a second writing machine,
#      an edit made directly on github.com, or a teammate given write access.
#
# The marker is written FIRST and unconditionally, because every git operation
# below has an early-exit path. A marker that only gets written when the pull
# succeeds would go missing on exactly the sessions where something was unusual.
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

# ── 1. Session start marker ──────────────────────────────────────────────────
# Single line, ISO-8601 UTC, Z-suffixed. Overwritten every session start.
# Machine-local and gitignored — it describes this machine's session, not the
# repository's state, and committing it would be meaningless to anyone else.
#
# Failure here is never fatal. A missing marker means End-Session records
# duration as unknown, which the specification treats as normal rather than
# an error. Interrupting a session over a timing nicety would be the wrong
# trade.
mkdir -p "$REPO/.claude" 2>/dev/null
if ! date -u +%Y-%m-%dT%H:%M:%SZ > "$REPO/.claude/.session-start" 2>/dev/null; then
  echo "[session-start] Could not write .claude/.session-start — session duration will be unavailable." >&2
fi

# ── 2. Pull ──────────────────────────────────────────────────────────────────
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
