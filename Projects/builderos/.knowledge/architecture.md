# Architecture — BuilderOS

- **Updated:** 2026-07-28

## Overview
A two-tier plain-Markdown knowledge store with a routing rule between the tiers, plus a
charter that loads automatically and a skill that provides the command layer.

```
        session work
             │
       classify (silent)
             │
   "helps a future unrelated project?"
        │              │
       yes             no
        ▼              ▼
   AI-Memory/     Projects/<n>/.knowledge/
   (permanent)      (project state)
        ▲              │
        └── promote ───┘
        ──── demote ───►
```

## Components

### Charter (`CLAUDE.md`)
- **Responsibility:** define behaviour for every session at this root.
- **Owns:** the classification categories, the routing rule, session start/end protocol.
- **Why at root:** auto-loads, so it applies without anyone invoking anything.

### Global base (`AI-Memory/`)
- **Responsibility:** hold knowledge that outlives any single project.
- **Owns:** Principles, Learnings, Patterns, Prompts, Snippets, Mistakes, Decisions,
  Templates, Tools, Glossary — and `INDEX.md`, the single map of all of it.

### Project memory (`Projects/<name>/.knowledge/`)
- **Responsibility:** hold state for one project — scope, architecture, roadmap, progress,
  decisions, session logs.
- **Owns:** nothing permanent. Anything permanent here is a promotion candidate.

### Skill (`builderos`)
- **Responsibility:** execute the manual commands.
- **Depends on:** the charter for definitions; duplicates the routing rule deliberately so
  it works even when the root is not open.

## Boundaries

The one boundary that matters is **global vs. project**, decided by a single question:
*will this help a future, unrelated project?*

It is placed there because that is the only split that is cheap to get wrong. Misfiling into
the project tier costs one `Promote this` later; misfiling into the global tier costs one
`Demote this`. Both are reversible in a single command, which is why this boundary was
chosen over finer-grained ones (per-domain, per-language) that would be expensive to
reorganise.

Consequence: everything else — category names, directory numbering, file naming — is a
convention, not architecture, and can change without breaking anything.

## Data model
Markdown files with YAML frontmatter (`status`, `created`, `updated`). Status is the quality
ladder: Draft → Validated → Best Practice → Deprecated. Formats per category are defined in
`AI-Memory/08_Templates/FORMATS.md`.

## External dependencies
| Service | Used for | Failure mode if unavailable |
|---|---|---|
| Filesystem | everything | total; there is no other store by design |
| Git (recommended) | history, diffing, review | history lost, base still usable |

## Known weaknesses

1. **No enforcement.** Nothing validates format, detects duplicates, or blocks a session
   that skips its update. The system degrades silently — and a stale base is worse than no
   base, because it is still trusted. Mitigation is discipline plus periodic `Memory audit`.
   Accepted for v1.0; a lint script is the obvious v1.1.

2. **No search beyond grep.** Fine at tens of entries, painful past roughly 150 files, at
   which point `INDEX.md` becomes the bottleneck rather than the map.

3. **Retrieval is the weaker half.** The charter specifies capture in detail and retrieval in
   one line. A write-only knowledge base is the most likely way this fails — worth watching
   over the first few projects and tightening if session starts routinely skip the read.

4. **Over-capture risk.** Recording everything makes nothing findable. `IGNORE` is
   load-bearing and should dominate by volume.
