# The Context Hierarchy + Student Ask V1 (2026-09-06)

Why: a student's academic life is not one lecture. The product needed to answer
"what should I work on?" across everything a student is in — without becoming a
second, looser knowledge system. This milestone makes the three-level academic
context REAL: one retrieval architecture, three explicit boundaries, and a
global Ask surface on the student home built on persistent conversations.

## The three boundaries

| Scope     | What it reads                                        | Surface |
|-----------|------------------------------------------------------|---------|
| `lecture` | one lecture's knowledge, nothing else                | lecture page chat |
| `course`  | every lecture in ONE subject (course = subject)      | course Ask tab |
| `global`  | every subject the authenticated student can access   | `/ask`, fed by the home hero |

Honest naming note: the product models **course → lecture → knowledge**. There
is no "unit/module" level inside a course — "subject" and "course" are the same
row, and the docs say "subject" only because that is the student's word for it.

**Scope is an authoritative retrieval ceiling, never a hint.** Conversation
history provides continuity; it never widens what may be read. All three
boundaries flow through ONE assembler — `loadAcademicContext`
(`src/lib/knowledge/academic-context.ts`) — and every path reads through the
same gated canonical reader (`readKnowledge`: replay, quarantine and
visible-to-students rules apply identically). A wider scope is a wider read,
never a second knowledge layer and never a bypass of a narrower gate.

## The global boundary is enumerated server-side

No client-supplied id participates in the global read. `listCourseMemberships`
(same file) enumerates the session user's courses — enrolled first, then owned,
each in deterministic oldest-first order — and `loadAcademicContext` fans
`readKnowledge` across them with the reader's OWN relationship deciding
visibility per course (an owner reads their course as its owner, a student as a
student).

The fan-out is capped (`GLOBAL_COURSE_CAP = 12`). When the cap actually cuts
something off, the assembler reports `subjectsOmitted` and the prompt's
SUBJECTS line says "and N more subjects NOT searched" — a truncated world is
never presented to the model as complete. Enrolled-before-owned means a faculty
account's student life survives the cut, not their own courses.

## $0 facts, paid synthesis

The routing layer (`ask-routing.ts`) is unchanged in kind, extended in reach:

- **Direct ($0)**: database-backed listings — assignments, topics, deadlines,
  audience. Globally these are grouped per subject (`DirectAttribution`:
  "### SUBJECT" headings; topic keys "SUBJECT — lecture").
- **Model (paid, metered)**: genuine synthesis — "what should I work on
  first?", comparisons ("which one is due first" vetoes direct), "which
  lecture covered X" (vetoes direct). The teaching prompt distinguishes
  **FACTS** (cited, the record's) from **RECOMMENDATIONS** (explicitly the
  model's own).
- Gemini is never used for titles, simple listings, or UI operations.

Attribution rides the whole way down: the prompt labels each unit (`lecture:`
at course scope, `from: SUBJECT — lecture` at global), the wire's sources carry
`courseId` and a `lectureTitle` prefixed with the subject, citations link into
the right course, and the sources fold's heading says where the evidence is
actually from ("From the lecture" / "From the lectures" / "From your
subjects").

## Global conversations

Same store, same ownership model as CONVERSATIONS.md; scope `'global'`
(course_id and lecture_id both null, enforced by the schema CHECK).

- `POST /api/ask` — the only way to ask globally. **GET is refused (405)**: a
  GET that answers questions would spend money and write rows on a top-level
  cross-site navigation (SameSite=Lax cookies ride along on those).
- `GET /api/ask/conversations` — the caller's global threads only.
- **Scope is never borrowed**: a global thread continued from a course surface
  is a 404, and a course/lecture thread presented to `/api/ask` is the same
  404 — indistinguishable from a foreign or absent id.
- **An old thread never outlives access.** On resume
  (`GET /api/conversations/[id]`), a global thread re-checks the caller's
  CURRENT memberships and withholds any stored source whose course they can no
  longer open (per-course owner/student gating, same rules as readKnowledge).
  The prose stays — it is the student's own conversation — the evidence stops
  being replayable. Verified live by an un-enroll/re-enroll probe in
  `verify:conversations`.

## The home hero and the carried question

The student home's hero is a real composer. Its question reaches `/ask`
through **sessionStorage** (`ask-carry.ts`), not a `?q=` URL parameter: a URL
contract would let anyone craft a link that makes a signed-in student's
browser ask — spend money and write a thread — on page load. The key is
consumed once on mount, so a reload (even after a failed ask) never re-asks.
A conversation is still created only by its first question, never by a visit.

## Metering

Every global ask records one `ask_runs` row with `course_id null` (= global)
and logs `[ask-meter] ... course=global`. Migration
`20260906180000_ask_runs_global.sql` (drop NOT NULL on `ask_runs.course_id`)
was **applied by the operator on 2026-09-06** and the meter verified live the
same day (`meter: "ok"`, null-course rows present in `ask_runs`, $0 direct
routes). On a database without it, global rows degrade honestly to
`meter: "unavailable"` naming the migration; course/lecture metering is never
affected either way.

## Known limits (deliberate, recorded)

- `readKnowledge` loads a course's full knowledge+evidence rows to retain 8;
  globally that is up to 12 such reads per ask. Bounded today by the cap and
  by real course sizes, not by the query. Row caps / term-filtering in the
  query are roadmap work, deliberately NOT done here — the reader is part of
  the closed v1.2.0 engine.
- `GET /api/courses/[id]/ask` still answers questions (the lecture page and
  seven test suites use it). It shares the SameSite-Lax exposure the global
  route refused; hardening it (Sec-Fetch-Site checks or a POST migration) is
  a recorded follow-up, not a silent regression.
- No per-user rate limit exists anywhere yet.

## Test coverage

- `test:ask` (79) — routing vetoes, grouped direct attribution, retrieval pins.
- `test:answer` (69) — scope labels in the grounding, SUBJECTS line,
  truncation caveat, FACTS-vs-RECOMMENDATIONS contract.
- `verify:conversations` (47, live, $0 by construction) — all three
  boundaries visible in sources, global listing/persist/resume/follow-up,
  scope-borrowing 404s both directions, stranger 404s, GET-405,
  un-enrollment source withholding, meter honesty, cleanup.
- Paid eval (`.eval/scope-eval.json`) — one deliberate pass + one retry after
  fixes; 5 model calls, 8,510 tokens total for the milestone.
