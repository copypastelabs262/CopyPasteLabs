# End-Session — Implementation Prompt

> **Status: NOT YET WRITTEN — intentionally.**

This file will hold the implementation of `specification.md`. It has deliberately been left
empty at spec version 1.0.0.

## Why this is empty

A specification is cheap to change; a skill in daily use across every project is not. Writing
the prompt before the spec is reviewed would mean debating design decisions through an
implementation, which is slower and produces worse decisions.

## Before writing it

1. Read `specification.md` end to end, including § 16 (open questions).
2. Confirm the spec is approved. If anything in it is wrong, fix the spec first and bump its
   version — do not work around it here.
3. Verify the prerequisites in § 10.3 and § 4.3 are in place:
   - the one-time human-authored `Inbox/` note in `AI-Memory/INDEX.md`
   - `scripts/session-start.sh` writing `.claude/.session-start`
   - `.claude/.session-start` listed in `.gitignore`
   - every project's `project.md` carrying a `slug:` in its frontmatter

## When writing it

The implementation must satisfy every success criterion in § 11.1. Two deserve particular
attention because they are easy to get subtly wrong:

- **Criterion 5** — permanent AI-Memory folders byte-identical before and after. Fully
  mechanical, and should be an automated test rather than an inspection.
- **§ 10.2, the gate** — must have no override flag. A safety rule that can be switched off is
  not a safety rule.

`examples/` shows the exact output shape expected.

## The relationship between these two files

`specification.md` is the contract. This file is one implementation of it. When they disagree,
the specification is correct and this file has a bug.
