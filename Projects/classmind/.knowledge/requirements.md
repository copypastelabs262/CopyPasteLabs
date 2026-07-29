# Requirements — ClassMind

- **Updated:** 2026-07-29

Derived from `research/2026-07-24-synopsis-full.md` §8, §9, §11. Where this file and the
synopsis disagree, **this file wins** — the synopsis is frozen history.

## Functional

| ID | Requirement | Priority | Status |
|---|---|---|---|
| F1 | Upload a lecture audio file and store it against a course and date | Must | Not started |
| F2 | Transcribe audio to text with word- or segment-level timestamps | Must | Not started |
| F3 | Extract academic events: assignment, deadline, exam topic, announcement | Must | Not started |
| F4 | Attach a confidence score and a source timestamp to every extracted event | Must | Not started |
| F5 | Distinguish obligation ("submit by Friday") from suggestion ("please read Ch. 5") | Must | Not started |
| F6 | Resolve relative dates ("next Thursday") to absolute dates using the lecture date | Must | Not started |
| F7 | Faculty review queue: approve / edit / reject, one click per event | Must | Not started |
| F8 | Only faculty-approved events are visible to students | Must | Not started |
| F9 | Student dashboard: deadline calendar, assignment list, exam topics | Must | Not started |
| F10 | Natural-language search/Q&A over approved events, with source citation | Must | Not started |
| F11 | Detect that a later lecture *modifies* an earlier event rather than creating a new one | Should | Not started |
| F12 | Record every faculty correction as a labelled training/eval example | Should | Not started |
| F13 | Notify students when a deadline is added or changed | Could | Not started |
| F14 | Faculty upload of slides/PDFs as additional context | Could | Not started |
| F15 | Live in-lecture transcription | Won't (capstone) | Out of scope |

**F12 is more strategically important than its "Should" priority suggests.** It is the only
requirement that compounds — every correction makes the next semester's model better and
builds a dataset nobody else has. It is Should rather than Must only because the capstone can
be demonstrated without it. See `project.md` § Ambition for why we build it anyway.

## Non-functional

- **Correctness over coverage.** A missed assignment is an inconvenience; a *wrong* deadline
  shown confidently is a student failing a submission. Everything student-facing is
  precision-first: when unsure, show nothing rather than a guess. This is why F8 exists.
- **Faculty time budget: under 5 minutes review per 1-hour lecture.** If review takes longer
  than entering the assignment manually, adoption is zero. This is a hard product constraint,
  not a nice-to-have, and it caps how many low-confidence events we may surface.
- **Traceability.** Every student-visible claim links to a lecture, a timestamp, and the
  transcript span it came from. No unsourced output, ever.
- **Processing latency:** a 1-hour lecture fully processed within 2 hours of upload.
  Overnight would also be acceptable; same-lecture-day is not required.
- **Query latency:** under 3 seconds for search and Q&A.
- **Cost ceiling:** under ₹3,000 total for the capstone across all services.
- **Multi-tenancy from day one.** Every row is scoped to an institution. Not because we have
  two colleges, but because retrofitting tenancy after real data exists means a migration
  under pressure. Cheap now, expensive later.

## Evaluation requirements

These are what the capstone is actually graded on. Targets carried from the synopsis, with
the caveat recorded in `research/README.md` — they were set before any measurement.

| Event type | Precision target | Recall target |
|---|---|---|
| Deadline | ≥92% | ≥88% |
| Assignment | ≥90% | ≥85% |
| Exam topic | ≥85% | ≥80% |

- Dataset: 15–20 real Indian college lectures, 3–5 different lecturers
- Ground truth: independently annotated, inter-annotator agreement (Cohen's κ) ≥0.85
- Baselines required for the comparison to mean anything: (a) pattern matching alone,
  (b) LLM with no pipeline, (c) human manually searching the transcript
- Error analysis broken down by code-switched vs. monolingual segments — this is the actual
  research finding

## Constraints

- Three-person team, all learning; no dedicated ML engineer
- 8–10 month timeline with fixed college review dates
- No budget for GPU infrastructure or paid enterprise services
- No lecture data yet, and none obtainable without institutional permission
- Single-writer repository (see `TEAM.md`)

## Assumptions

Each of these is a bet. Listed so that when one breaks we recognise it as a broken assumption
rather than a mysterious failure.

1. **A partner college will grant access to 15+ real lectures.** *Unverified and the single
   largest risk in the project.* Without it there is no evaluation, and without evaluation
   there is no capstone — only a demo.
2. **Faculty will actually do the review step.** If they won't, the trust model collapses and
   the product needs redesigning around unverified output.
3. **Current ASR handles Hinglish well enough that extraction errors are extraction errors,
   not transcription errors.** *Unverified.* If transcription quality is the bottleneck, the
   research question changes shape — measure this in week 2, not month 4.
4. Students will trust and use a dashboard rather than continuing to ask friends on WhatsApp.

## Explicitly out of scope

- Recording infrastructure — we consume recordings, we do not produce them
- Grading, submission handling, or plagiarism checks
- Anything requiring integration with a college's existing LMS or ERP
- Languages other than Hindi–English for the capstone evaluation
