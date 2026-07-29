# End-Session — Worked example

A complete Inbox entry for one fictional ClassMind session, showing what correct output looks
like. These files exist to remove ambiguity from `specification.md` — where prose and example
disagree, the specification is authoritative.

```
AI-Memory/Inbox/classmind/2026-07-29T1432Z-asr-model-selection/
├── session.md         ← human narrative
├── evidence.json      ← machine, git-derived, verifiable
├── candidates.json    ← machine, model-asserted, needs review
├── status.json        ← lifecycle (the only mutable file)
└── changes.patch      ← omitted here; 24 KB in the real entry
```

## What this example is meant to demonstrate

**The evidence/assertion split (P1).** `evidence.json` contains no opinion — every field is
re-derivable from git. `candidates.json` contains nothing but opinion, and every item carries
its own confidence and basis. A reader can tell instantly which is which.

**The fabrication guard (§ 7.3).** `extraction_meta` records that two candidates were
*discarded* for having no basis, and names them. Discards are as informative as emissions:
they show the guard ran and prove the extraction was selective rather than exhaustive.

**Realistic volume (§ 7.4).** Three candidates from a substantial two-and-a-half hour session.
An entry with twenty would indicate the extraction is capturing discussion rather than
findings.

**Basis quality.** Compare `cand-001`'s basis — a named artefact and a specific measurement —
against the discarded "benchmarks need real data", which is true, generic, and traceable to
nothing. The first is a finding; the second is a platitude.

**Scope routing.** `cand-001` proposes `global`: it is a fact about ASR models that would help
an unrelated future project. `cand-002` proposes `project`: it is a choice about ClassMind
specifically. This is the charter's routing rule applied per candidate.

**Honest failure recording.** The `Problems hit` section in `session.md` records a benchmark
that initially gave the wrong answer, and why. A session log with no problems in it is usually
an incomplete one.

**Provenance for inferred values.** `session_boundary.base_strategy` records *how* the base
commit was chosen, not just what it was. An inferred boundary and a recorded one have very
different reliability, and the reader needs to know which they have.
