---
slug: builderos
---

# BuilderOS

- **Status:** Stable v0.1 baseline — supporting infrastructure, feature-frozen
- **Started:** 2026-07-28
- **Owner:** CopyPasteLabs
- **Repo / location:** `E:\CopyPasteLabs` (charter: `CLAUDE.md`, base: `AI-Memory/`)

## What it is
The knowledge system itself, treated as a project. BuilderOS is the charter plus the
directory structure plus the command vocabulary that turns each working session into
durable, reusable engineering knowledge.

## Why it exists
Engineering insight is produced continuously and lost almost as fast — in chat logs, closed
tickets, and people's heads. Without capture, every project restarts near zero and effort
scales linearly with project count. BuilderOS exists to make it scale sublinearly.

It is tracked as a project (rather than living only in `AI-Memory`) because it has its own
architecture, roadmap, and decisions that need somewhere to accumulate. Meta-work on the
knowledge system is still work, and it needs a session log like anything else.

## Scope
**In:** the charter, `AI-Memory` structure, the project `.knowledge` template, the manual
command vocabulary, the `builderos` skill.

**Out:** the content of the knowledge base. Entries in `AI-Memory` are governed by BuilderOS
but are not part of this project. Tooling to enforce or validate the format is currently out
of scope — see Known weaknesses.

## Current state
v0.1 baseline reached (2026-07-28): structure, charter, single-writer collaboration model,
and auto-save hook all in place. **Declared feature-frozen** — reclassified from primary
project to supporting infrastructure. Improved only when real capstone work exposes a
genuine, blocking gap; non-blocking ideas go to `roadmap.md` instead of being built. Zero
learnings, prompts, snippets, or mistakes captured yet — the base is empty by design and
fills from real work.

## How to run it
- The charter in `CLAUDE.md` auto-loads at the repository root.
- Manual commands are handled by the saved `builderos` skill.
- New project: `cp -r Projects/_TEMPLATE Projects/<name>`, then fill `.knowledge/project.md`.

## Key files
| Path | Purpose |
|---|---|
| `CLAUDE.md` | The operating charter, auto-loaded |
| `AI-Memory/INDEX.md` | Map of the global base; must list every file |
| `AI-Memory/08_Templates/FORMATS.md` | Canonical entry formats |
| `AI-Memory/01_Principles/PRINCIPLES.md` | Engineering rules |
| `Projects/_TEMPLATE/.knowledge/` | Scaffold copied into every new project |

## Open blockers
None. Two limitations are known and accepted for v1.0 — see `architecture.md`.
