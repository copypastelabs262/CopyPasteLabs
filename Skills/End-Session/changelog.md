# End-Session — Changelog

Specification versions. Semantic versioning applies to the **contract**, not the prose:

- **Major** — a change that breaks existing Inbox entries or downstream readers
- **Minor** — additive capability; old entries remain valid
- **Patch** — clarification, correction, or wording, with no contract change

---

## 1.0.1 — 2026-09-06

Patch — corrections found by real usage across the first ten captured entries. No contract
change; existing Inbox entries remain valid.

**Fixed:**

- **Session-boundary collapse (Phase 2).** The boundary used to resolve to `head` on any pushed
  branch, giving `commits: []` for sessions that had committed and a Phase 3 misroute to
  `_platform`. Root cause: `scripts/autosave.sh` pushes after every edit, so
  `git merge-base HEAD origin/<branch>` (old strategy 3) equalled `head`, and the marker-based
  strategy 2 waited for a 40-hex SHA the marker never holds. New strategy 2 reads the marker's
  **ISO-8601 timestamp** to find the last commit before the session began
  (`git rev-list -1 --before=<ts> HEAD`); strategy 3 is retained only for a genuinely diverged
  local branch and guarded against the `== head` collapse. This also removes the `_platform`
  misroute, which was a downstream symptom of the empty range.
- **`Inbox/.lock` is now gitignored** (repo `.gitignore`). Phase 8 stages `AI-Memory/Inbox/`;
  a committed lock would read as "held" to the next run on a fresh clone. The Phase 1
  release-before-stage workaround stays as defence in depth.

**Deferred, not fixed (recorded so it is not rediscovered):** § D.2 — `context_completeness`
is a model assertion but is written into `evidence.json` as well as `candidates.extraction_meta`,
which weakens `evidence.json`'s byte-reproducibility guarantee for that one field. Relocating it
to `extraction_meta` only is a schema-and-examples change worth a 1.0.2; left as-is this pass to
keep the Promoter build the focus. Behaviour is unchanged and documented at § D.2.

## 1.0.0 — 2026-07-29

Initial specification. Not yet implemented.

**Established:**

- Capture/curation split. End-Session records evidence; `Knowledge-Promoter` curates.
- **Evidence and assertion separated into distinct files** (P1) — the central design idea.
  `evidence.json` is machine-derived and verifiable; `candidates.json` is model-asserted and
  requires review. Never mixed.
- Write-once artifacts, with `status.json` as the single mutable exception.
- Mechanical enforcement of the write allowlist (§ 10.2), with no override flag.
- Hybrid diff storage: per-file stats always, full patch only under 256 KiB / 200 files.
- Session identifiers using `T<HHMM>Z` rather than colons, for Windows compatibility.
- Project slugs declared in `project.md` frontmatter rather than inferred from directory names.
- Reserved `_platform` slug for repository-level work outside any project.
- Fabrication guard: no candidate without a stated basis; zero candidates is a valid outcome.

**Decisions worth recording:**

- *Project document writes were scoped down.* An earlier draft had End-Session updating
  project documents broadly. Narrowed to only the two files the charter mandates —
  `sessions/<date>.md` and `progress.md`. Automatic edits to design documents are how design
  documents stop being trusted.
- *Full diff storage was rejected in favour of the hybrid policy.* Git already holds every
  diff; storing a second copy is duplication that one dependency bump turns into permanent
  repository bloat. Regeneration is safe only because `TEAM.md` § 2 forbids force-pushing to
  the main branch — a dependency now cross-referenced in both documents.
- *One entry per session, not per project touched.* Cross-project sessions are common;
  duplicating the narrative would produce two records that drift apart.

**Known gaps, deliberately left open:** see § 16 of the specification. The base-commit strategy
across long project gaps and the 256 KiB cap in particular are considered guesses awaiting real
usage data.
