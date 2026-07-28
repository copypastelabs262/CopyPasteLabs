---
status: Validated
created: 2026-07-28
updated: 2026-07-28
---

# Adopt BuilderOS: file-based knowledge system in Markdown + Git

## Decision
All CopyPasteLabs engineering knowledge is stored as plain Markdown files in the repository,
split between a global `AI-Memory/` base and per-project `.knowledge/` directories, governed
by a charter in the root `CLAUDE.md`.

## Reason
- Plain text is greppable, diffable, and reviewable in the same workflow as code, so
  knowledge updates travel with the changes that produced them.
- No vendor dependency. The base outlives any specific tool, editor, or AI assistant.
- The global/local split keeps permanent knowledge from being buried inside one project,
  which is the specific way ad-hoc documentation fails.
- A `CLAUDE.md` at the root auto-loads, so the charter applies without anyone remembering
  to invoke it.

## Alternatives Considered
- **Notion / Confluence** — better editing and search, but the knowledge lives away from the
  code, drifts from it, and is unavailable to tooling that reads the repo. Rejected.
- **Obsidian vault** — excellent linking and graph view, but adds an app dependency for
  something that must work from a terminal and from CI. Rejected; its linking conventions
  are worth borrowing later.
- **Structured database / issue tracker** — queryable, but high friction to write, and
  knowledge capture dies at the first point of friction. Rejected.
- **Do nothing, rely on chat history** — the status quo being replaced. Unsearchable in
  practice, and lost entirely when a session ends.

## Trade-offs
- **No enforcement.** Nothing validates format, detects duplicates, or blocks a session that
  skips its update. The system degrades silently if the discipline lapses, and a stale
  knowledge base is worse than none because it is still trusted.
- **No search beyond grep.** Fine at tens of entries, painful at hundreds. Accepted for now;
  revisit when `AI-Memory` exceeds ~150 files.
- **Merge conflicts** on shared files like `INDEX.md` and `PRINCIPLES.md` as the team grows.
- **Curation cost is ongoing.** `Memory audit` and `Refactor memory` are not optional
  maintenance; without them the base grows faster than it sharpens.

## Date
2026-07-28
