# Inbox — staging, not knowledge

Nothing in this directory is knowledge yet. It is what sessions **captured**; what the project
**knows** lives in `AI-Memory/01_Principles` … `10_Glossary`, and only `Knowledge-Promoter`
puts it there.

Created on 2026-08-21 by the first run of `End-Session`.

## What is here

One directory per session:

```
Inbox/<project-slug>/<YYYY-MM-DD>T<HHMM>Z-<topic-slug>/
  session.md        human narrative — an assertion, written by the model
  evidence.json     derived from git — verifiable, no model opinion
  candidates.json   proposals — every one carries a basis, none is a conclusion
  status.json       lifecycle; the only mutable file in the entry
  changes.patch     the diff, when it is small enough and holds no secret
```

`<project-slug>` comes from a project's `.knowledge/project.md` frontmatter, never from a
directory name. `_platform` is reserved for work that belongs to no single project.

## The rules

**Entries are write-once.** Once an entry directory exists, every file in it is immutable
except `status.json`. If a session needs to correct an entry, it writes a new one — it does not
edit history.

**`status.json` belongs to `Knowledge-Promoter`.** End-Session writes it exactly once with
`state: "pending"` and never touches it again. Valid states are `pending`, `in_review`,
`promoted`, `partially_promoted`, `rejected`, `superseded`.

**Evidence and assertion never share a file.** `evidence.json` must be re-derivable from git
alone. `candidates.json` and `session.md` are what the model claims. Keeping them apart is what
lets a reader trust the first without having to trust the second.

**A candidate is a proposal, not a finding.** It proposes a scope and a status; the Promoter
assigns them and may disagree. Nothing enters permanent memory at `Validated` or above on one
session's evidence.

**Duplicates get flagged, never merged.** A session that suspects overlap with existing
knowledge records the paths in `possible_duplicates` and stops there. Merging is the Promoter's
work.

## The failure mode to watch

A growing backlog of entries still marked `pending`. Capture is cheap and curation is
deliberate, which is the point — but if curation never happens, this directory becomes a
landfill and the split has bought nothing. Count the pending entries occasionally.

As of its creation this is a live problem rather than a hypothetical one:
`Skills/Knowledge-Promoter/` is a stub, so nothing here can be promoted yet.

## Contracts

- `Skills/End-Session/specification.md` — what produces these entries
- `Skills/Knowledge-Promoter/specification.md` — what consumes them
- `AI-Memory/INDEX.md` — the map of permanent knowledge; this directory is deliberately absent
  from it
