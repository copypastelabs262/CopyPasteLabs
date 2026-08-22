# 2026-08-22 — ClassMind V1: built the product, then drove it and fixed what that exposed

## Starting state

The Product Platform had been scaffolded earlier the same day, in a session that hit its usage
limit mid-stream. What existed: the schema (7 tables, RLS on with zero policies), the `lectures`
storage bucket, the transcription module with the Sarvam adapter, the extraction module, 19
routes, and the whole UI. `lint`, `tsc` and `build` all passed.

**None of it had ever been run.** No course had been created, no lecture uploaded, no candidate
reviewed, no student had read anything. By the definition of done given for V1, that is not done
— "a feature is complete only when its actual user workflow works."

Also carried in: the extraction self-test had never been executed, `package.json` referenced a
`scripts/setup-storage.mts` that did not exist, and the decision to build the product at all —
which crosses the frozen walkthrough protocol — had been flagged in conversation but never
written down.

## Work done

**1. Made the workflow runnable without paying Sarvam.** Built a fixture `TranscriptionProvider`
(`src/lib/transcription/fixture.ts`) behind the existing interface, selected by
`TRANSCRIPTION_PROVIDER=fixture`. It replays three verbatim Sarvam Batch responses captured
during Lab v0 RUN 1, exported once to `fixtures/transcription/` so the product never reads Lab
v0's `runs` table at runtime.

This is not a mock in the usual sense. The response bytes are real, so normalization, evidence
offsets and provenance are exercised against genuine output; only the network call and the queue
delay are simulated. Every provenance record written this way opens its limitations with
`REPLAYED, NOT TRANSCRIBED`, and Sarvam stays the default so nothing falls back to replay by
accident.

**2. Drove the whole product over HTTP** (`scripts/e2e.mts`, 67 checks): sign in, create a
course, add context, upload 10.5 MB of real audio through a signed URL, transcribe, poll,
extract, confirm/edit/reject, then re-enter as a student and ask a question. The load-bearing
checks are negative — a student's lecture payload carries zero candidates, a student cannot rule
on a candidate or trigger extraction, and the anon key cannot read any of the four tables
directly.

**3. Ran it, and it found a real defect in extraction.** The rules engine read an 18-minute
university course-outline lecture as **2 generic guidance items**. It missed the entire
module-by-module syllabus and the prescribed textbook — the only two things in that lecture a
student actually needs. The lexicon had been built from a Class-12 coaching lecture, so it knew
"homework", "DPP" and "notes on Telegram", and had no rule at all for a lecturer walking through
a syllabus.

Fixed with two rules, both at suppression `"none"` because every sentence they exist to catch is
first-person-plural and veto A would otherwise delete all of them:

- `exam_scope.course_coverage`, gated on a curricular unit noun so "we will look at the
  compressor" stays silent while "in the second module we discuss..." fires.
- `announcement.prescribed_material`, requiring a named text plus a prescription cue, so "buy
  this" is separated from "a book exists".

Same lecture now yields 21 candidates. Method version bumped 1.0.0 → 1.1.0. Extraction suite
grew 65 → 75 cases, including the negative gates.

**4. Verified the Hindi and wrong-language paths** (`scripts/verify-languages.mts`, 33 checks,
written by a parallel agent). Hindi: 130 segments, median segment 17.4s — the chunk-grouping
regression is not back, and that number is now pinned by an assertion. Devanagari `due_phrase`
values come through verbatim.

**5. The most important finding of the session, and it came from running rather than reading.**
The provenance guard written for Lab v0's Arabic failure cannot see that failure. On 2026-08-21
Sarvam returned fluent romanized Arabic for an English lecture **and reported
`language_code: "en-IN"`** — the same code the run was configured with. `buildProvenance`
compares exactly those two fields. On the one run it was written for, the branch is unreachable.

The only thing that flagged that transcript was the engine's own 0.617 confidence clearing the
0.8 threshold by 0.183. At 0.85, the same Arabic text would have carried no warning at all.

`src/lib/provenance/language-check.ts` reads the text instead. Function-word density over the
three real responses: 42.5% English function words in the genuine English lecture, 3.9% in the
romanized Arabic, 76.3% Devanagari in the Hindi one. An order of magnitude apart, which is why a
crude test suffices. It appends a limitation and never blocks or edits a transcript, refuses to
judge under 120 tokens, and stays silent for `unknown`. 16 checks in `scripts/test-provenance.mts`,
run against the real fixtures — the decisive one asserts that the misdetected fixture produces a
limitation.

`language_probability` also got a structured home on `ProcessingProvenance`. It had survived only
as prose inside `limitations`, so "show me every lecture transcribed below 0.8" — the exact sweep
that would surface this class of failure — was not a query anyone could write.

**6. Handled a consequence of the version bump.** Candidates are immutable, so re-extracting a
lecture after the bump inserts 1.1.0 rows alongside the 1.0.0 ones and the review queue shows the
same sentence twice. The lecture route now returns only the newest version per method and reports
`supersededCount`. Nothing is deleted — method comparison is the reason the method is pluggable —
and a verdict already given on a now-superseded candidate is still honoured.

**7. Wrote the missing `scripts/setup-storage.mts`.** It lists buckets rather than probing,
because a missing bucket comes back from the SDK as `status` 400 with `statusCode` `"404"` — a
*string*, in a different field — which is what broke Lab v0's version.

## Decisions made

- [2026-08-22 — Build the Product Platform V1 before the walkthrough runs, and encode the domain
  model in it](../decisions.md). This crosses the frozen `walkthrough-protocol.md` § Stopping
  rule **completely**, not on the technicality the 2026-08-11 entry could defend:
  `extraction_candidates.kind` enumerates the domain model in a check constraint, before the
  walkthrough that was meant to validate it. The entry states the cost plainly — if the
  walkthrough later shows the categories are wrong, that is a migration and a re-extraction, and
  it must not be argued away by keeping bad categories because they are already built.

## Mistakes hit

- **Declaring the previous session's work "built" on the strength of a passing build.** The
  handoff written that morning said the backend was "complete and verified working". It compiled;
  it had never run. Running it took under an hour and found a defect that made the product's core
  output nearly worthless on its actual target audience (university lectures). Passing checks
  measure the absence of one class of error and say nothing about the rest.
- **A guard written from a post-mortem, tested only against its own description.** The
  language-mismatch check reads exactly like a fix for the Arabic bug and is dead code against
  it. Nobody had run the failing input through it. The bug report said "wrong language returned";
  the code was written against that sentence rather than against the response.

## Ending state

The end-to-end V1 workflow is demonstrable. Four suites, all green: extraction 75, provenance 16,
end-to-end 67, languages 33.

Still true and unchanged: **no live Sarvam call has ever been made from the product**, so
Constitution VII's one-command regeneration is unmet for it and the Azure Blob SAS upload
convention remains an untested assumption. The `translit` Arabic bug is **still unfixed in Lab
v0** — only the product now guards against it. There is no romanized-Hinglish ASR fixture, which
is the case the extraction lexicon covers most heavily and has the least evidence for. The
walkthrough is still unrun.

Two test accounts exist in the live Supabase project (`faculty.test@` and `student.test@`
`classmind.local`) and **must be deleted before any real use**.

## Next session should start with

**One real lecture, recorded by an actual lecturer, transcribed by a live Sarvam call.** Not more
features. Every number in this session comes from three lectures captured in one Lab v0 run, all
of them found material rather than a class anyone taught. The fixture path is honest about being
a replay, but it cannot tell you whether the extraction rules work on speech from the room this
product is for — and the one thing that is certain about the current lexicon is that it was
tuned to a lecture that is not that room either.
