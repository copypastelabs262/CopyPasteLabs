# Lab — the Experiment Platform

Throwaway code that produces non-throwaway evidence.

## What the Lab is for

Answering questions we cannot answer by thinking. Nothing else. If a question can be settled
by reading [`.knowledge/domain-model.md`](../.knowledge/domain-model.md) or by two people with
a printout, it does not justify code.

**What that rule does and does not rule out.** Two people with a printout can settle whether the
domain model is legible — that is the frozen
[`walkthrough-protocol.md`](../.knowledge/walkthrough-protocol.md), and it is why **no Lab version
is a prerequisite for it**; its step 2 accepts any suitable ASR in about twenty minutes. What a
printout cannot settle is whether transcription is good enough to build on, at a quality that
survives "what produced this number?" That is Lab v0's question, it was chosen independently of
the walkthrough, and **it validates no concept.** See
[`decisions.md`](../.knowledge/decisions.md), 2026-08-07.

## Disposability, stated precisely

**The code is disposable. The evidence is not, and neither is what we learned.**

Constitution Articles IV, VII, VIII and IX bind the Lab exactly as hard as they bind the
product — those are research-validity articles, and a disposable system can still produce a
result you cannot reproduce. The production-data articles (I, II, III, V) do not apply here,
because the Lab serves no students and issues no Ledger.

So: rewrite freely, delete freely. But every run records what produced it, and every number
is regenerable by one command.

## Versions

One directory per version. Versions are **never moved and never deleted** — a superseded
version stays exactly where it is, with its README rewritten to say why it ended. There is no
`archive/`; moving a directory breaks every reference to it, and the README's own
"Why it ended" field already is the historical record.

| Version | Goal | Status |
|---|---|---|
| [`v0-ingestion/`](v0-ingestion/) | Audio in, transcript out, viewable | In progress — Milestone 2 of 3 |

Each version README carries the same six fields: **Goal · Scope · Success criteria · What was
learned · Why it ended · Replaced by.** The last three are filled in when the version closes.
That README is the version's permanent record; the code around it is not.

## Where findings go

Not here. A finding that changes what the project believes belongs in
[`.knowledge/`](../.knowledge/) — `decisions.md` for a choice, `progress.md` for a state
change, a results document for an experiment's output. The version README links to it.

The test: **deleting a lab version's code must not lose anything we know.** If it would, the
knowledge is in the wrong file.

## The gate that runs through this directory

Two of the three 2026-07-30 council reviewers, briefed separately, drew the same line in
different words:

> Anything that names Commitment, Notice, Guidance, or an annotation unit is **behind** the
> gate. Anything that handles bytes and provenance is **not**.

v0 is entirely on the near side — it moves bytes and records where they came from. The moment
a lab version starts naming domain concepts, it is asserting the domain model is correct,
which is the exact thing the walkthrough exists to test.

## Standing constraints

- **No database, no HTTP API, no auth, no embeddings.** JSONL and files (Constitution VII).
- **No Docker.** Docker Desktop needs WSL2, BIOS virtualization and admin rights, and may
  simply fail on one of three student laptops.
- **No field named `confidence`** unless it has been calibrated (Constitution IX). Until then
  the name is `review_priority`.
- **Provenance from line one**, not retrofitted: engine, dated model snapshot, version,
  parameters, commit.
- **Devanagari on Windows fails silently.** Write UTF-8 explicitly, verify by reading back —
  PowerShell will happily print `?????` and CSV will look correct in Notepad and be corrupt
  everywhere else.
