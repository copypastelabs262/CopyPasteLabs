# Progress — BuilderOS

Reverse-chronological. Newest at the top.

## 2026-07-28 (latest) — v0.1 baseline declared; feature freeze

**Done:** Declared BuilderOS a stable v0.1 baseline and reclassified it from primary project
to supporting infrastructure — see the corresponding entry in `decisions.md`. Updated
`roadmap.md` so only gap-driven, blocking items remain actionable; everything else is
deferred until the capstone reveals it's actually needed.

**In progress:** Nothing on BuilderOS itself — by design.

**Blocked:** Same open item as before: the auto-push hook still needs a session restart to
verify it fires end-to-end.

**Next:** Define and scaffold the actual capstone product under `Projects/`. That is now the
primary objective; BuilderOS work only resumes if the capstone hits a genuine blocker.

## 2026-07-28 (later) — Collaboration model
**Done:** Established the single-writer model — Shyam's machine writes, Shiv and Darsh read
and propose via GitHub Issues. Rewrote the auto-save hook as `scripts/autosave.sh` (secret
guard, portable paths, loud failures, real commit messages) after finding it hardcoded to one
path and silencing all errors. Added `scripts/session-start.sh` to pull on start. Hardened
`.gitignore` from one line to a full secret ruleset. Wrote `README.md` as human orientation
for the two readers. Extended `TEAM.md` with who-writes and the shared-account gap.

**In progress:** Nothing.

**Blocked:** Push not verified end-to-end — the environment had no network route to GitHub.
Commits are queued locally and should land on the next real edit.

**Next:** Confirm the push landed, then define the actual product. Every `.knowledge` file
still reads `<Project Name>` — the collaboration machinery is currently ahead of the thing it
exists to support.

## 2026-07-28 (bootstrap)
**Done:** Bootstrapped BuilderOS v1.0 from an empty `E:\CopyPasteLabs`. Created the
`AI-Memory` tree (10 categories + INDEX), seeded Principles, the knowledge-compounding-loop
Pattern, the adoption Decision, canonical entry FORMATS, Tools register, and Glossary. Built
the `Projects/_TEMPLATE/.knowledge` scaffold. Wrote the charter to `CLAUDE.md` and saved the
`builderos` skill for the manual command vocabulary.

**In progress:** Nothing.

**Blocked:** Nothing.

**Next:** Run one real project through the system end-to-end before adding tooling. Do not
build the lint script until a genuine session has shown which parts of the format actually
get used.
