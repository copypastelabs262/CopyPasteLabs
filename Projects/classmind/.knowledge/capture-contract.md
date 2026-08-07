---
status: Draft
created: 2026-07-30
updated: 2026-07-30
---

# The ClassMind Capture Contract

**This document is implementation-independent and outranks every schema.** It does not say how
anything is stored. It says what must be *written down at all*, from the first byte of real
data onward.

It exists because [constitution.md](constitution.md) Article 0 states that code is cheap and
unrecorded state is unrecoverable at any price — and that sentence describes a capture
obligation, not a database design. Whether Observation and Attestation live in one table or
five is reversible in an afternoon. Whether the Observation was ever written down is not
reversible at any cost, by anyone, ever.

## Which platform this binds

This contract binds the **Product Platform** — the system real colleges and real students use.
"The first byte of real data" means real *product* data: consented recordings, real students,
a real institution.

It does **not** bind the disposable **Experiment Platform** (see [decisions.md](decisions.md),
2026-07-30), which processes public lectures for research and holds no production data. That
platform is exempt from the nine obligations below, with exactly one carried over from the
Constitution: its **evidence must be reproducible** (Article VII), because the capstone is
graded on it. Disposable code, non-disposable evidence.

## The test

Every migration, refactor, rewrite, vendor change and schema redesign is checked against one
question:

> **Can we still reconstruct everything that happened?**

If yes, the change is safe regardless of how radically it reshapes storage.
If no, it violates the Constitution regardless of how elegant it is.

A person with no knowledge of the domain model can apply this test. That is the point of
separating it out.

---

## The nine obligations

Each states the fact, why losing it is terminal, and how to check compliance.

### 1. The raw audio, on its own retention clock

**Fact:** the captured audio artefact, unaltered, deletable independently of everything derived
from it.

**Why terminal:** it is the only genuinely irreplaceable input. Every other artefact in the
system can be recomputed from it; it can be recomputed from nothing.

**Check:** can you re-run the entire pipeline from scratch on a lecture from six months ago?

---

### 2. Speech-to-text output exactly as returned, tagged with engine and version

**Fact:** the transcription as the engine produced it — not cleaned, not corrected, not
normalised — with the engine name and version recorded alongside.

**Why terminal:** the mistakes are the research finding. A transcript that has been quietly
fixed cannot tell you how the engine performed on code-switched speech, which is the question
the capstone is graded on. And an untagged transcript cannot be compared against a second
engine's attempt, which is scheduled work.

**Check:** can you measure the same engine's error rate today that you measured last term?

---

### 3. Every machine-produced claim carries its producer's full identity

**Fact:** model id, **dated snapshot** (not a floating alias), prompt version, decoding
parameters, and the code commit that ran.

**Why terminal:** cannot be backfilled. Without it you can never distinguish "our prompt got
worse" from "the vendor silently upgraded the model underneath us," and every accuracy number
in the report becomes a claim nobody can check or reproduce.

**Check:** pick any stored extraction. Can you say exactly what produced it, and re-run it?

---

### 4. The spoken phrase, kept alongside anything resolved from it

**Fact:** for every date, time or duration, store what was actually said ("next Thursday"), the
utterance timestamp, the timezone assumed, the calendar consulted, and the rule applied —
alongside the resolved absolute value.

**Why terminal:** store only the resolved date and every future improvement to date parsing can
be applied going forward but never to history. Every date bug becomes permanently unfixable
retroactively. This is the cheapest obligation on the list and the one most often skipped.

**Check:** if you fix a date-parsing bug tomorrow, can you re-resolve last term's dates?

---

### 5. Proposal and verdict both survive, separately

**Fact:** what the machine said, and what the human ruled, as two distinct immutable records.
Approval never overwrites the proposal. **Denials are retained**, not deleted.

**Why terminal:** the pair *is* the label. Overwrite the proposal and you have a fact with no
provenance and no training signal. Delete the denials and you throw away the most informative
examples the system produces — the ones where it was wrong.

**Check:** for any approved item, can you still see exactly what was proposed before a human
touched it?

---

### 6. Every human act carries actor identity and timestamp

**Fact:** who did it, in what role, under what authority, when. On every attestation, edit,
retraction and override.

**Why terminal:** retro-attributing history is impossible. "Who set this deadline and on what
basis" is the first question asked the first time a student is harmed by a wrong one.

**Check:** for any item on a student's screen, can you name the person accountable for it?

---

### 7. Citations anchor to time in the audio, not to derived structure

**Fact:** every citation records the time range in the recording. A pointer to a transcript's
internal structure may be kept for convenience, but is never the durable anchor.

**Why terminal:** transcripts are re-generated. A citation anchored to a transcript row breaks
silently the moment a better engine runs — and a broken citation does not look broken, it looks
like a confident quotation of the wrong words.

**Check:** re-transcribe a lecture with a different engine. Do all its existing citations still
resolve to the right moment?

---

### 8. Every raw artefact is linked to the consent that authorises it

**Fact:** the consent grant, its stated purpose, its scope, its expiry, and its revocation
status — reachable from every artefact it covers.

**Why terminal:** consent cannot be obtained retroactively from people who have graduated. An
artefact whose authorisation cannot be demonstrated is an artefact that cannot lawfully be used,
and under purpose limitation, consent for one purpose does not extend to another.

**Check:** pick any recording. Can you produce the consent covering every voice in it, and
execute a complete erasure on request?

---

### 9. Every row is scoped to an institution

**Fact:** the owning institution, on everything.

**Why terminal:** unscoped data cannot be separated later. When an institution departs and takes
its data with it — which the domain model treats as a normal event, not a crisis — unscoped rows
cannot be handed over or deleted, only guessed at.

**Check:** can you export, or destroy, exactly one institution's data and nothing else?

---

## What this contract does *not* constrain

Stated explicitly, because the value of this document depends on it staying small.

It says nothing about table count, table shape, column types, normalisation, indexes, whether
storage is relational, which vendor is used, what the API looks like, or how anything is
queried. **All of that is free to change at any time**, provided the nine facts above survive
the change.

If this document ever grows to constrain schema shape, it has stopped being a capture contract
and become an architecture document, and it should be cut back.

---

## Status of the obligations

Frozen 2026-07-30, before any real data exists — which is the only moment freezing it is free.

An obligation may be **added** at any time. Removing one requires a written Decision entry
naming what becomes permanently unrecoverable as a result, because that is what removal means.
