# End-Session — Changelog

Specification versions. Semantic versioning applies to the **contract**, not the prose:

- **Major** — a change that breaks existing Inbox entries or downstream readers
- **Minor** — additive capability; old entries remain valid
- **Patch** — clarification, correction, or wording, with no contract change

---

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
