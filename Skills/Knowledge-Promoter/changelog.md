# Knowledge-Promoter — Changelog

## 1.0.0 — 2026-09-06

First real specification and implementation. Curation is a **periodic, human-gated sweep**, not a
per-session automation.

**Design source:** Black Canvas's production "BC Brain" system (running since June 2026), whose
Layer 6 "Monthly Curation" is exactly this skill's job — read a batch of captures, dedupe, rank by
recurrence, present to a human, promote what they approve. Rather than answer the placeholder's
seven open design questions from first principles, this spec takes BC Brain's proven answers
(§ 7). The over-engineered alternative — a 7-question treatise — was rejected once the company's
running system showed the simple version works.

**Established:**

- Two modes: `plan` (default; writes nothing; the review gate) and `execute` (applies an
  operator-approved plan). No automatic mode, ever.
- **Recurrence is the ranking signal.** A finding across 2+ independent entries proposes
  `Validated` — the charter's "second independent project" made concrete as BC Brain's "seen 2+
  times = confirmed pattern." Single sightings promote at `Draft` only if high-confidence or an
  operator directive; otherwise they DEFER and wait for recurrence.
- **Rejections recorded with a reason** (operator decision, 2026-09-06), so weak candidates are
  not re-argued each sweep.
- Promotion **moves, never copies**; merge over append; both enforced here, at promotion, since
  End-Session only flags duplicates.
- The Promoter is the sole writer of permanent `AI-Memory/01_…10_` and `INDEX.md`, and may touch
  nothing inside an entry but its `status.json`. INDEX integrity verified every execute.
- The § 6 interface contract with End-Session is carried forward unchanged from the 0.0.0
  placeholder.

## 0.0.0 — 2026-07-29

Placeholder created alongside `Skills/End-Session/specification.md` 1.0.0.

Records only the interface contract that End-Session was designed against, so the contract is
visible from the consumer's side rather than living solely in the producer's documentation.

No specification written. No implementation.
