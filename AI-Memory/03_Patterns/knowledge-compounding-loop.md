---
status: Draft
created: 2026-07-28
updated: 2026-07-28
---

# Knowledge Compounding Loop

## Problem
Engineering insight is produced continuously during development and lost almost as fast.
It dies in chat logs, in closed tickets, and in the heads of whoever happened to be
debugging that day. Each new project restarts near zero, so effort scales linearly with
project count instead of sublinearly.

## Solution
Treat knowledge capture as a build artifact, not as documentation. Every session runs a
classify-then-route loop: information observed during work is tagged (Project, Learning,
Pattern, Prompt, Snippet, Decision, Mistake, Idea, Ignore) and written to exactly one
destination before the session closes.

The routing test is a single question: **"will this help a future, unrelated project?"**
Yes → global `AI-Memory`. No → the project's `.knowledge/`. Ambiguous → project-local now,
promote later once a second project proves it generalises.

## Architecture

```
Session work
     │
     ├─► classify (silent, continuous)
     │
     ├─► reusable? ──yes──► AI-Memory/<category>/    (permanent, cross-project)
     │        │
     │        no
     │        ▼
     │   Projects/<name>/.knowledge/  (state, decisions, session logs)
     │
     └─► end of session ──► update summary: files changed, nothing else
```

Two invariants hold the system together:

1. **Single destination.** A fact lives in one file. Promotion *moves*; it never copies.
2. **Merge over append.** Updating an existing entry beats creating a near-duplicate. The
   base should get sharper over time, not just bigger.

A quality ladder (Draft → Validated → Best Practice → Deprecated) prevents a one-off
observation from being mistaken for a proven rule. Promotion up the ladder requires
evidence from an independent project.

## Benefits
- Project N+1 starts with the accumulated context of projects 1..N.
- Decisions carry their rationale, so they can be revisited instead of blindly inherited.
- Mistakes convert into preventions — a bug is paid for once.
- Plain Markdown in Git: greppable, diffable, portable, no vendor dependency.

## Limitations
- **Discipline is the only enforcement.** Nothing in the filesystem stops entropy. Skip the
  end-of-session update a few times and the base silently becomes untrustworthy — which is
  worse than having no base, because people still consult it.
- Scales poorly past a few hundred entries without search; the INDEX becomes the bottleneck.
- Over-capture is a real failure mode. Recording everything makes nothing findable. The
  `Ignore` category is load-bearing and should be the most-used classification by volume.
- Retrieval must be enforced at session *start*, not just capture at session end. A knowledge
  base nobody reads is a write-only log.

## Reusable
Yes. The category set and the routing question are domain-independent; only the directory
names are CopyPasteLabs-specific.
