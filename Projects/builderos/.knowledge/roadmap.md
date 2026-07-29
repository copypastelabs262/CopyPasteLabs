# Roadmap — BuilderOS

- **Updated:** 2026-07-29

## Status: v0.1 baseline — feature-frozen, supporting infrastructure only

BuilderOS is no longer the primary project. Nothing below is worked on speculatively — an
item moves off this list only when real capstone development hits it as a genuine, blocking
gap. See the 2026-07-28 "reaches v0.1 baseline" decision in `decisions.md`.

## Now
- [x] Bootstrap structure, charter, and skill (v1.0)
- [x] Establish single-writer collaboration model and auto-save hook (v0.1)

## Next (gap-driven only — do not pull these forward speculatively)
- [x] Verify the auto-push hook actually fires end-to-end. **Evidence (2026-07-29):**
      `origin/master` tracks local `master` at `4c43abc` with a clean tree, which only
      happens after a successful push. Inference, not a live check — the verifying session
      had no network route to GitHub — but strong enough to stop treating it as a blocker.
      Re-open if `git status` ever reports `ahead` after an edit.
- [ ] Replace the `<Project Name>` placeholders in `.knowledge` templates once the capstone
      project scaffold is actually created and filled in.

## Later
- [ ] Lint script: validate frontmatter, flag files missing from `INDEX.md`, detect
      near-duplicate titles. Addresses the "no enforcement" weakness.
- [ ] Auto-generate the `INDEX.md` catalogue from frontmatter so it cannot drift.
- [ ] Tighten the session-start retrieval protocol if reads are being skipped in practice.

## Ideas
- Cross-linking convention between entries (`related:` in frontmatter) once there are enough
  entries for links to matter.
- A `stale:` review date in frontmatter to surface entries nobody has re-validated.
- Full-text search if the base passes ~150 files.

## Done
- 2026-07-28 — v1.0 bootstrapped: `AI-Memory` tree, project template, charter, skill.
- 2026-07-28 — v0.1 baseline: single-writer model, auto-save hook, hardened `.gitignore`,
  `TEAM.md`. Declared feature-frozen; focus shifts to the capstone product.
