# Research Archive — ClassMind

**These files are a historical archive. Do not edit them and do not treat them as current.**

They are the pre-build research and synopsis drafts produced 2026-07-24, stored verbatim as
they were written. They record what we believed *before* any code existed. Their value is
exactly that they are frozen — when a design decision later turns out to be wrong, this is
where you look to understand what we knew at the time.

Anything still true and still live has been carried into `../project.md`,
`../requirements.md`, `../architecture.md`, and `../decisions.md`. **Those are the source of
truth. These are not.**

---

## What is here

| File | Lines | What it is |
|---|---|---|
| `2026-07-24-research-findings.md` | 375 | Competitive analysis, research-gap assessment, market sizing, sources. **The most load-bearing document** — it is the only one containing original research rather than restatement. |
| `2026-07-24-synopsis-full.md` | 892 | The complete synopsis. Includes the data schema, worked extraction examples, sample LLM prompts, references, and appendices that the shorter drafts drop. **Canonical synopsis.** |
| `2026-07-24-synopsis-professional.md` | 387 | Shortened synopsis draft. Adds a team-structure section not in the full version. |
| `2026-07-24-synopsis-mid.md` | 352 | Shortened synopsis draft. No unique content. |
| `2026-07-24-synopsis-condensed.md` | 236 | Two-page summary. Useful as a pitch/one-pager, no unique content. |

## Why five near-identical files are kept

They overlap by roughly 85%, which normally violates
[Principle 4 — one source of truth](../../../AI-Memory/01_Principles/PRINCIPLES.md).

The exception holds because these are **inputs, not documentation**. They were submitted or
drafted for college assessment, so they have provenance value that a merged version would
destroy — you cannot later prove what the submitted synopsis said if it has been edited into
a summary. Deleting them would also violate the principle in the other direction: the
research findings and the appendices in the full synopsis exist nowhere else.

The rule that keeps this honest: **nothing may be derived from more than one of these.** When
content moves into live project knowledge, it comes from the canonical full synopsis or from
the research findings. The three shortened drafts are read-only history.

## Known limitations of this research

Recorded here so nobody rediscovers them the hard way:

1. **Novelty claims are unverified.** The synopsis says "first system to..." in several
   places. That claim was not re-checked against a systematic literature search, and it is
   the single easiest thing for an examiner to puncture. Soften to "we are not aware of
   published work on X" and re-run the literature check before submission.
2. **Accuracy targets were set before any measurement.** The ≥92% / ≥90% / ≥85% precision
   figures are aspirations written before a single lecture was processed, not projections
   from a baseline. Treat them as goals to be revised once real numbers exist — see
   [Principle 3](../../../AI-Memory/01_Principles/PRINCIPLES.md).
3. **No privacy or consent analysis.** Recording a classroom captures students' voices as
   well as the lecturer's. India's DPDP Act 2023 applies. This is absent from all five
   documents and is a genuine gap, not an oversight to be filed away.
4. **Market sizing is directional.** "1.4M college students" understates Indian higher
   education enrolment by an order of magnitude depending on what is being counted; the
   revenue figures are order-of-magnitude estimates, not a model. Fine for a synopsis,
   not fine for an investor conversation.
