# 2026-07-28 — BuilderOS v1.0 Bootstrap

## Starting state
`E:\CopyPasteLabs` was completely empty. No `AI-Memory`, no `Projects`, no charter. Nothing
to read in, no prior decisions, no blockers.

## Work done
- Created `AI-Memory/` with all ten categories and `INDEX.md`.
- Seeded four substantive entries: `PRINCIPLES.md`, the `knowledge-compounding-loop` Pattern,
  the `adopt-builderos` Decision, and `FORMATS.md` defining every entry format.
- Added the `TOOLS.md` register and `GLOSSARY.md`.
- Built `Projects/_TEMPLATE/.knowledge/` with seven files plus `sessions/`.
- Wrote the charter to `CLAUDE.md` at the root so it auto-loads.
- Saved the `builderos` skill covering the manual command vocabulary.
- Created `Projects/builderos/` so the system can record work on itself.

## Decisions made
Two, both in `decisions.md`: tracking BuilderOS as a project, and deliberately duplicating
the routing rule into the skill.

## Learnings captured
None. Nothing was learned here that was not already specified in the charter — inventing
Learning entries to make the base look populated would be exactly the over-capture failure
the system warns about. The base fills from real work.

## Mistakes hit
Two symlinks were created by accident during scaffolding and could not be removed (the mount
denies deletes and the permission request was declined). They are inert but untidy:
`AI-Memory/08_Templates/project-knowledge` (points correctly at the project template) and
`Projects/08_Templates` (broken). Both need manual deletion.

Not recorded as a formal Mistake entry — it is an environment quirk, not a reusable
prevention. Worth noting only so the next reader is not confused by them.

## Ending state
v1.0 complete and verified: every file non-empty, all frontmatter present, template proven
copyable. The knowledge base is intentionally near-empty of content.

## Next session should start with
Reading `AI-Memory/INDEX.md` and `01_Principles/PRINCIPLES.md`, then picking a real project.
Resist adding tooling to BuilderOS until one project has run through it end-to-end — the
first genuine session is the only real test of whether this format survives contact with
work. Nothing here is proven yet.
