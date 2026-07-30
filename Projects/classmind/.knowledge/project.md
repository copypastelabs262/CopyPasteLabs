---
# Permanent identifier. Note this project's own Codename entry below: "ClassMind"
# is a working name and is expected to change. The slug does not change with it.
# Renaming the product is a display concern; renaming the identifier would orphan
# every session log, Inbox entry, and decision recorded against it. This is
# exactly why slugs are declared rather than inferred from the directory name.
slug: classmind
---

# ClassMind

- **Status:** Planning — scope defined, architecture not yet signed off
- **Started:** 2026-07-29
- **Owner:** CopyPasteLabs (Shyam, Shiv, Darsh)
- **Repo / location:** `E:\CopyPasteLabs\Projects\classmind`
- **Codename:** "ClassMind" is a working name, not final. All research documents use it, so
  it stays until a naming decision is made. A rename is cheap now and expensive after a
  domain, an app store listing, and a college submission carry the name.

## What it is

ClassMind listens to a recorded college lecture and pulls out the things students actually
need to act on — assignments, submission deadlines, exam-important topics, and
announcements — and puts them in a dashboard with a link back to the exact moment in the
lecture where each one was said.

It is built for Indian college classrooms specifically, where lecturers mix Hindi and
English inside a single sentence ("यह बहुत important concept है जो exam में आएगा"). That
mixing is called **code-switching**, and it is the thing that breaks the off-the-shelf tools.

## Why it exists

The problem is not that lectures aren't recorded. Panopto, Echo360 and Otter.ai already do
that well. The problem is that a recording is an hour-long blob, and the sentence that
matters — "submit Chapter 5 analysis by Friday 5 PM" — is thirty seconds inside it, with
nothing marking it as important.

So the information exists but is not *actionable*. Students miss deadlines that were
announced clearly. Faculty repeat themselves. Before an exam, students re-watch entire
lectures hunting for "this will be on the exam."

Existing tools fail at the specific step of turning speech into **structured, verifiable
academic events**. Transcription tools treat a lecture like a business meeting and cannot
tell "please read Chapter 5" (a suggestion) from "submit Chapter 5 analysis by Friday" (an
obligation). That distinction is the entire product.

## Who it is for

Two users with genuinely different needs, which is why there are two interfaces:

- **Students** — want a calendar that is correct and a search box that answers "when is
  assignment 3 due?" They will stop using it the first time it is confidently wrong.
- **Faculty** — want it to cost them almost no time. Their role is review and approval, not
  data entry. If reviewing extractions takes longer than typing the assignment into the LMS,
  the product has failed regardless of how good the AI is.

The faculty approval step is not a compliance formality. It is what makes the student-facing
data trustworthy. It also produces a corpus of corrections that is useful for regression
testing and few-shot exemplars — but **it is not the graded evaluation dataset and it is not
the company's moat.** Both of those claims were made and withdrawn on 2026-07-29; see
[decisions.md](decisions.md) and Article VIII of [constitution.md](constitution.md).

## Scope

**In (capstone):**

- Upload a recorded lecture audio file; transcribe it with speaker timestamps
- Extract assignments, deadlines, exam topics and announcements, each with a confidence
  score and a link to its source timestamp
- Track the same event across lectures so a changed deadline is detected as a change, not as
  a second, conflicting event
- Faculty review interface: approve / edit / reject each extraction
- Student dashboard: deadline calendar, assignment list, exam topics, natural-language
  search over approved events, answers that cite their source
- Evaluation on 15+ real annotated Indian college lectures with precision and recall reported
  honestly, including where and why it fails

**Out (explicitly, for the capstone):**

- Live/real-time transcription during the lecture. Adds hardware, streaming, and partial-
  transcript handling for zero research value. Upload-a-file is the same product with a
  fraction of the risk.
- Mobile apps. A responsive web page covers the demo and the pilot.
- LMS integration (Canvas, Moodle, Blackboard, Teams). High-value for the startup, high
  integration cost, and it demonstrates nothing about the research question.
- Attendance tracking, at-risk-student prediction, auto-generated quizzes. Each is a
  separate product wearing this product's clothes.
- Languages beyond Hindi–English. Adding Tamil or Marathi multiplies the annotation burden
  without changing the research finding. The architecture must not *prevent* them — that is
  different from building them.
- Fine-tuning or training our own speech model.

**Out (permanently, as a matter of positioning):**

- Being a lecture *recording* platform. That market is mature, commoditised, and defended by
  incumbents. ClassMind sits on top of recordings, wherever they come from.

## The research question

> How accurately can structured academic events be extracted from code-switched
> Hindi-English classroom speech, and which combination of techniques — pattern matching,
> named-entity recognition, and LLM-based classification — gives the best precision under
> real classroom conditions?

Two things follow from phrasing it this way, and both matter:

1. **A negative result is still a result.** If it turns out a well-prompted LLM beats the
   elaborate pipeline, that is a publishable finding and we should report it, not hide it.
2. **The comparison is the contribution, not the app.** The dashboard is how we demonstrate
   the extraction works. It is not what is being examined.

## Current state

Scope defined and research archived (2026-07-29). No code. Architecture is drafted but
**blocked on founder sign-off** for six deviations from the technology stack proposed in the
synopsis — see [decisions.md](decisions.md) and the session log.

Nothing has been built, no data has been collected, and no college partnership exists yet.
The last of those is the real schedule risk.

## Team context

Three co-founders, all currently learning to build rather than experienced engineers, working
with AI assistance throughout. Two consequences that are architectural, not social:

- **Prefer boring, well-documented technology.** When something breaks at 2am before a
  review, the deciding factor is how many Stack Overflow answers exist, not how elegant the
  tool is.
- **Fewer moving parts beats more capable parts.** Every additional service is another thing
  that can break in a way nobody on the team knows how to debug. This is the reasoning behind
  several of the pending architecture deviations.

Single-writer repository model applies — see [TEAM.md](../../../TEAM.md).

## Ambition

This is a college capstone *and* a startup attempt, and those two goals conflict more often
than they align. Where they conflict, the rule is:

> **Capstone deadlines win on schedule. Startup thinking wins on architecture.**

Meaning: cut features to hit a review, never cut the data model or the seams. A missing
feature costs a week. A data model that cannot support multiple colleges costs a rewrite.

## How to run it

Nothing to run yet.

## Key files

| Path | Purpose |
|---|---|
| `.knowledge/constitution.md` | **The nine articles every design decision must obey** |
| `.knowledge/research/` | Frozen pre-build research and synopsis drafts |
| `.knowledge/architecture.md` | System design (pending sign-off) |
| `.knowledge/requirements.md` | What must be true for this to be done |
| `.knowledge/decisions.md` | Choices made and what they cost |
| `.knowledge/roadmap.md` | Sequenced plan |

## Open blockers

1. **Architecture sign-off.** Six proposed deviations from the synopsis stack are awaiting a
   decision. No code should be written before this resolves, because two of them change the
   data model.
2. **No college partnership.** The evaluation dataset needs 15+ real lectures with faculty
   and student consent. This has the longest lead time of anything in the project and has not
   started.
3. **No consent or data-protection position.** Classroom audio contains identifiable
   students, not just the lecturer. Required before the first real recording, not before the
   first line of code — but the gap between those two is smaller than it looks.
