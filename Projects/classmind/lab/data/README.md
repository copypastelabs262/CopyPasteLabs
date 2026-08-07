# Lab data

**Contents are gitignored. This README is the only file here that git tracks.**

## What lives here

Artefacts that are large, licence-encumbered, or regenerable: source lecture audio,
transcripts, model outputs, intermediate JSONL.

It sits at `lab/` level rather than inside a version because **data outlives the code that
produced it.** The four walkthrough lectures do not get re-downloaded when v0 is replaced.

```
lab/data/
├── audio/         source lecture audio, as downloaded
├── transcripts/   STT output, exactly as returned
└── runs/          per-run JSONL output, one directory per run
```

Subdirectories are created by the code that needs them, not in advance.

## Why gitignored

A 40-minute lecture WAV is 200–400 MB. `scripts/autosave.sh` runs `git add -A` after every
edit, so without an ignore rule the first stored lecture would be committed automatically and
permanently, and would exceed GitHub's 100 MB per-file hard limit — breaking push for
everyone, recoverable only by rewriting history.

There is a second reason, and it outranks the first: **we have not yet read Sarvam's terms on
secondary use of submitted audio, and we have no consent or data-protection position.**
Classroom audio contains identifiable students, not just the lecturer. Until both are settled,
audio must not enter a shared repository at all. See
[`.knowledge/capture-contract.md`](../../.knowledge/capture-contract.md) Article 8.

## How to regenerate it

Every run must be reproducible from what *is* committed — a source list, the code, and the
recorded provenance (Constitution VII). When v0 exists, the exact command goes here.

If regenerating this directory ever requires knowledge that lives only in someone's head, that
is a Constitution VII violation and gets fixed before the next run.

## What must never live here

Anything that is a *finding*. Findings go to [`.knowledge/`](../../.knowledge/). This
directory is assumed deletable at any moment.
