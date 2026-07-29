---
status: Draft
created: 2026-07-29
updated: 2026-07-29
---

# Session — 2026-07-29 — Founding council: Architecture Philosophy Review

**Format:** three independent reviewers, briefed separately, no shared findings, each
assigned a different seat. Output synthesised into `../constitution.md`.

| Seat | Model | Assignment |
|---|---|---|
| Domain Architect | Opus | Engineering constitution, first-principles domain model |
| Contrarian | Opus | Attack the founder's thesis, attack the moat claim, five-year lens |
| AI Infrastructure & Research Validity | Sonnet | AI-as-infrastructure critique, synopsis decision review |

**Limitation to record:** all three are Claude models. No cross-vendor diversity was
available, so they share blind spots a GPT or open-source reviewer might not have. Weight the
convergences accordingly — agreement between three Claude agents is weaker evidence than
agreement across vendors would be.

---

## The finding that matters most

**Two reviewers independently discovered that faculty corrections cannot serve as the graded
evaluation dataset.** The Contrarian predicted this finding would be uniquely his; the
Infrastructure reviewer found it independently and ranked it his #1 risk. Independent
discovery from different starting briefs is the strongest evidence this council produced.

The claim they killed was written into `decisions.md` on 2026-07-29 by the engineering
partner, as: *"the annotated evaluation dataset the project is graded on is a by-product of
the product working normally."* It was wrong for four separable reasons:

1. **Single annotator** — Cohen's κ is not computable at all, and `requirements.md` demands
   κ ≥ 0.85.
2. **Not blind** — the reviewer sees the model's answer first. A plausible-but-wrong
   extraction gets a light edit rather than independent reconstruction, which anchors the
   "ground truth" to the model's own output and understates the true error rate.
3. **Speed-optimised** — the five-minute-per-lecture budget is deliberately designed to
   discourage careful adjudication.
4. **Recall is structurally unmeasurable** — faculty only react to what the system proposed,
   so recall computed this way is capped by the model's own output. Same reason a search
   engine's recall cannot be measured from click logs.

Cost of the correction: the evaluation dataset is real work that had been assumed away, and
the schedule has a hole in it. Cost of *not* correcting it: an examiner asking "how was
ground truth established" invalidates every precision figure in the report, independent of
what the numbers turn out to be. This is now Article VIII.

---

## Where the council disagreed

### 1. Is the correction corpus a moat? — Contrarian wins on arithmetic

The **Architect** argued the corpus plus the commitment ontology is the core domain — the
thing a competitor cannot copy because acquiring it needs college relationships and faculty
hours.

The **Contrarian** did the sum nobody had done. A one-hour lecture yields 3–8 events. Capstone
total: 100–160 labels. One college-year: ~1,500. Thirty colleges over two years: ~90,000, of
which a large fraction are near-duplicates of "submit by Friday." For a four-class
classification task with one binary flag and a date parse, that is a few thousand dollars of
vendor annotation. Genuine data moats sit at 10⁶–10⁹ with a closed loop that improves a
ranking; this sits at 10³–10⁴ and grows *linearly in faculty review hours* — the scarcest and
least willing input in the system. Linear growth in your scarcest input is the opposite of
compounding.

He added three arguments the Architect did not address: the corpus is a bet against model
progress on precisely the task model progress is aimed at; ownership is untested against any
contract, and a standard procurement template with customer-owns-data, delete-on-termination,
or no-secondary-use clauses kills it three separate ways; and DPDP purpose limitation makes it
statutory rather than merely contractual.

**Resolution: the Contrarian wins.** The moat framing is withdrawn from `decisions.md`. The
Architect's narrower point survives and was folded in — what is genuinely hard to copy is the
*commitment ontology and annotation guideline*, not the labels. Real defensibility is, in
order: system-of-record status, institutional distribution, integration depth, and the
sub-five-minute review workflow.

**Why this mattered practically, not just intellectually:** believing the corpus is the moat
would have made us resist the move to selective earned-trust review that `architecture.md`
already identifies as necessary at scale — because selective review reduces label volume. The
belief was a time bomb aimed at our own roadmap.

**Contrarian's bonus recommendation, accepted:** a pile too small to be a moat can still be
big enough to be a *standard*. Publishing the benchmark makes ClassMind the reference point
for the category, generates the citations the capstone needs anyway, and converts a fake moat
into real distribution. It costs nothing we were not already producing.

### 2. The founder's localized-change thesis — all three reject it as stated, for different reasons

The **Contrarian** attacked hardest and produced the most damaging evidence: the thesis is
unfalsifiable ("name one design it tells you *not* to build" — every abstraction localizes
some change, so every abstraction passes), and its single novel artefact is already broken.
The `extract(transcript, lecture_date) → [ProposedEvent]` signature in `architecture.md`
encodes four predictions, and `requirements.md` already falsifies two of them: F11 needs prior
events as input, and F14 anticipates slide context. He also observed that `architecture.md`
claims "the interfaces matter far more than what is inside them," when every project-ending
risk in this system is *inside* a box — ASR quality on Hinglish, obligation-vs-suggestion
extraction, faculty willingness to review.

The **Architect** agreed but landed somewhere more constructive: the thesis is not a procedure
because "how much must change" is undefined until you name *which* change. Write the axes
down and it becomes enforceable.

Both produced compatible replacement rules, and both are now in Article VI: the Architect's
**named axes** (LLM provider, ASR provider, extraction method, second institution, second
language pair — nothing else gets a seam) and the Contrarian's **Seam Test** (name the second
implementation, the owner, and the date, or write the concrete thing).

Applied, they cut one of the four existing seams — the pgvector→FAISS abstraction, which has
no named second implementation and is justified by a scale we may never reach.

**The Contrarian's sharpest observation, which reframed the whole review:** the proposed/
approved boundary that `architecture.md` presents as proof the philosophy works is a *safety
invariant*, not a change-localization device. It is justified entirely by asymmetric failure
cost and would be correct in a system whose code never changed. So the philosophy has zero
load-bearing wins — its one paraded success was caused by something else, and its one original
artefact is wrong. That is why Article III now explicitly says "do not let this be cited as
evidence for seams elsewhere."

### 3. Rewrite cost — a shared team bias, named

The Contrarian identified the same error appearing twice, in two different authors'
arguments: **systematic overestimation of rewrite cost.** `architecture.md` grades Supabase
lock-in "Serious" when it is Postgres + PostgREST + GoTrue, so `pg_dump` handles the database
and only auth is genuinely annoying — call it two weeks. `decisions.md` calls a multi-tenancy
retrofit "a rewrite of every query" when at 4,000 lines with a repository layer it is a week.

Both decisions remain correct. Both *reasons* were inflated. This matters because overstating
Supabase lock-in would push the team away from row-level security and Supabase Auth — the two
features that most reduce the risk they correctly identified.

### 4. Is "AI as infrastructure" the right frame? — Infrastructure reviewer splits it

His answer was the most useful nuance of the session. The sentence contains two claims:

- *"No code depends on a specific provider's SDK"* — correct, cheap, already mostly done.
- *"Treat AI as infrastructure"* as a general philosophy — **wrong for this product.**
  Infrastructure is by definition the thing you do not differentiate on. But the choice and
  tuning of extraction technique for code-switched speech *is the research question* and is
  what the startup would be sold on. Read as licence to pick a model once and stop paying
  attention, the frame quietly demotes the thing the project is graded on.

Restated for the team: *no code depends on a provider's SDK; the choice of provider, model and
prompt is a first-class, continuously measured research variable, not a plumbing decision made
once.*

He also identified where a provider abstraction must deliberately **not** hide things —
structured-output guarantees differ by provider, and designing to the lowest common
denominator means architecting around your weakest provider even while paying for your
strongest; Hinglish and Devanagari tokenize very differently across providers, so a transcript
that fits one call on one provider may silently chunk on another, which degrades F11
invisibly; and confidence is not comparable across model families.

### 5. Predictions that failed

The Contrarian pre-registered ten predictions about the other members. Recording the misses,
because they calibrate how much to trust the seat:

- **Predicted (wrongly) that neither other member would catch the evaluation contamination.**
  The Infrastructure reviewer found it independently and ranked it first. The finding is
  stronger for having been found twice.
- **Predicted the others would endorse the founder's thesis with a soft YAGNI caveat.** The
  Architect instead produced a harder, more enforceable rule than the Contrarian expected.
- **Predicted someone would propose event sourcing broadly, which he would oppose.** Nobody
  did. He and the Architect independently converged on append-only *for human decisions only*,
  which is now Article V.

---

## Convergences — found independently, therefore load-bearing

1. **Proposal and verdict must be separate, immutable records.** A mutable `status` column
   destroys what the model actually said, which is half of every label and the whole audit
   trail. Architect §2.3(c) and Contrarian §4.3, independently. → Article V.
2. **Confidence is uncalibrated and the schema lies about it.** Appendix D asks the LLM to
   self-report; that number then sorts the review queue and is a stated research objective.
   Architect Article VIII and Infrastructure §B6, independently. → Article IX.
3. **Transcripts need run-versioning from migration one.** The schema sketch implies one
   transcript per lecture; the roadmap schedules a Sarvam-vs-Whisper comparison in *week 2*.
   Two transcripts of one audio have nowhere to live.
4. **Provenance must be on every row from the first migration** — model id, dated snapshot,
   prompt version, code commit. All three reviewers. Cannot be backfilled at any price.
5. **Store the spoken date phrase, not only the resolved date.** Otherwise every future
   date-parsing fix can only apply going forward. Three columns; highest value per line found
   in the review.

---

## Open questions carried forward

- **Does the Observation/Commitment split earn its complexity at capstone scale?** The
  Architect argues `event` is the wrong core noun and that this is the actual cause of the
  unsolved `supersedes` problem. Cheap resolving experiment he proposed: annotate three real
  lectures and count what fraction of items are re-references to an existing commitment. Under
  5%, the flat model is defensible; over 20%, the split is mandatory.
- **Will faculty attest at all?** `requirements.md` assumption 2, unverified, and the core
  domain has no producer if it is false. The Architect's proposed test costs an afternoon:
  print twenty candidate events from a mock lecture *on paper*, sit with three lecturers, and
  time them. Currently the roadmap does not test this until Phase 3.
- **Is extraction genuinely a supporting domain rather than the core?** Resolvable by week 4
  from the first LLM-only precision number. ≥85% means commodity; ~55% means extraction is the
  hard core and the domain map needs redrawing.
- **What do Sarvam's terms say about secondary use of submitted audio?** Nobody has read them.
  A ten-minute check that should happen before the first upload.
- **Which hosted model, specifically?** "A hosted API" is a placeholder, not a decision. The
  Infrastructure reviewer noted Sarvam's own LLM is absent from consideration despite being
  the most domain-relevant candidate and already the ASR vendor.

---

## Files changed

```
Projects/classmind
  + .knowledge/constitution.md                       (new — the nine articles)
  + .knowledge/sessions/2026-07-29-council-...md      (this file)
  ~ .knowledge/decisions.md    (eval-dataset claim corrected; moat claim withdrawn)
  ~ .knowledge/project.md      (same two corrections; constitution added to key files)
```

Nothing promoted to `AI-Memory/` yet. Two candidates are held locally pending a second
project: *reviewing a design document as a build plan finds different problems than reviewing
it as a document*, and *a data moat claim should be sized arithmetically before it is allowed
to influence schema decisions*.
