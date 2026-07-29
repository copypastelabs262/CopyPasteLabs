# Knowledge-Promoter — Engineering Specification

| | |
|---|---|
| **Skill** | `Knowledge-Promoter` |
| **Spec version** | 0.0.0 — **not yet specified** |
| **Status** | Placeholder |
| **Created** | 2026-07-29 |

---

## Status

This skill has not been specified. This file exists to record the **interface contract** that
`End-Session` was designed against, so that contract is visible from both sides rather than
living only in the producer's documentation.

Do not implement from this file. Write the full specification first.

---

## Purpose (intended)

Review entries in `AI-Memory/Inbox/` and decide what earns a place in permanent `AI-Memory/`.
Curation, as distinct from capture — see `Skills/README.md` § "The capture/curation split".

---

## Interface contract with End-Session

`End-Session` guarantees the following. A change to any of these is a breaking change to both
skills and requires a major version bump on `Skills/End-Session/specification.md`.

### What the Promoter can rely on

| Guarantee | Detail |
|---|---|
| **Entry location** | `AI-Memory/Inbox/<project-slug>/<session-id>/` |
| **Required files** | `session.md`, `evidence.json`, `candidates.json`, `status.json` |
| **Optional file** | `changes.patch` — present only under the § 5.3 size policy |
| **Schema versioning** | Every JSON carries `schema_version` |
| **Immutability** | Every file except `status.json` is write-once and will never change |
| **Initial state** | `status.json.state` is always `pending` on creation |
| **Candidate identity** | Every candidate has an `id` unique within its entry |
| **Basis guarantee** | Every candidate has a non-empty `basis`. Candidates without one are discarded at capture, never emitted. |
| **Trust levels** | `evidence.json` is machine-derived and verifiable. `candidates.json` is model-asserted and must be treated as proposal only. |

### What the Promoter owns

`status.json`, exclusively, from the moment it is created. `End-Session` writes it once and
never touches it again — including on re-runs, which produce a sibling entry rather than
modifying an existing one.

Valid states: `pending` · `in_review` · `promoted` · `partially_promoted` · `rejected` ·
`superseded`.

### What the Promoter must not do

- **Modify any file other than `status.json` inside an entry.** The capture record is
  evidence; evidence that can be edited after the fact is not evidence.
- **Delete entries.** Archival is a separate concern, reserved for a future `Archivist` skill.
- **Treat `candidates.json` as authoritative.** Every candidate is a proposal. `confidence`,
  `basis`, and `possible_duplicates` exist to support a judgment, not to replace one.

---

## Questions this specification will need to answer

Recorded now so they are not lost, not because they have answers yet.

1. **What promotes a candidate from `Draft` to `Validated`?** The charter requires evidence
   from a second, independent project. How is that link established and recorded?
2. **How are duplicates merged?** `End-Session` flags `possible_duplicates` but never merges.
   Merging is this skill's core work and its hardest part — the charter's "merge over append"
   rule is what keeps the knowledge base sharpening rather than just growing.
3. **Who is the human in the loop, and where?** Fully automatic promotion would let a
   low-confidence model assertion become organizational doctrine. That must not be possible.
4. **How does `INDEX.md` stay correct?** It claims every AI-Memory file is listed. This skill
   is the only one permitted to write there, so index integrity is its responsibility.
5. **What happens to a rejected candidate?** Discarded, or retained as a record that the
   question was considered and answered no? The second is more useful and more expensive.
6. **Batch or per-entry?** Reviewing ten entries at once surfaces patterns invisible in any
   single one — but delays capture-to-knowledge latency.
7. **Can the Promoter request re-capture?** Currently no: the conversation is gone by then.
   This may be a permanent limitation worth stating rather than solving.
