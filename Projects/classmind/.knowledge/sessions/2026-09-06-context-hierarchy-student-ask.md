# 2026-09-06 (IV) — Context Hierarchy + Student Ask V1

**Milestone: DONE.** The three-level academic context is real — lecture, subject,
and global are one retrieval architecture with three explicit, server-enforced
boundaries — and the student home now opens into a global Ask surface built on
persistent conversations. Nothing pushed; local commits only, per the brief.

Architecture doc: `product/classmind-v4/CONTEXT-HIERARCHY.md`.

## What was built

**One assembler, three boundaries.** `loadAcademicContext`
(`src/lib/knowledge/academic-context.ts`) is the single place scope becomes a
read: lecture and subject ride the existing course machinery (course = subject,
confirmed; there is no separate "unit" level — the hierarchy is
course → lecture → knowledge and the docs say so honestly), and global fans the
SAME gated reader (`readKnowledge` — replay/quarantine/visibility identical)
across the session user's own memberships, enumerated server-side
(`listCourseMemberships`: enrolled first, then owned, deterministic
oldest-first, capped at 12 with an honest `subjectsOmitted` count that reaches
the model's SUBJECTS line as "and N more subjects NOT searched"). No
client-supplied id participates in the global boundary at all.

**Global Student Ask.** `/ask` (server-guarded page outside the class shell) +
`POST /api/ask` + `GET /api/ask/conversations`, all on the same AskWorkspace
surface as course/lecture ask. The home hero is a real composer that carries
the student's question to /ask and asks it once. Conversations persist at scope
'global'; a global thread continues ONLY at /api/ask (a course or lecture
thread presented there is a 404, and vice versa — scope is never borrowed).

**$0 facts vs paid synthesis, cross-subject.** Database-backed listings stay
direct and free, now grouped per subject ("### SUBJECT" headings; topic keys
"SUBJECT — lecture"). Synthesis goes to Gemini with FACTS (cited, the record's)
explicitly separated from RECOMMENDATIONS (marked as the model's own). New
direct-route vetoes send comparative-due and "which lecture covered X"
questions to the model instead of letting a listing masquerade as an answer.
Attribution flows the whole way: prompt labels, wire sources with courseId and
subject-prefixed lecture titles, citations that link into the right course,
and a sources fold heading that says "From your subjects" when the evidence
genuinely spans them.

## The paid eval loop (reproduce → fix → retest)

One deliberate pass + one retry: **5 Gemini calls, 8,510 tokens ≈ ₹0.12; Sarvam 0**
(`.eval/scope-eval.json`). The first pass caught three routing/retrieval
defects — "What do I need to work on?" missing assignments (WANTS_ACTIONABLE
lacked "work on"), "Which one is due first?" riding direct instead of
comparing, "Which lecture covered X?" answering with a syllabus dump — all
fixed, pinned offline in `test:ask`, and re-verified live: the retry's four
answers ground correctly, mark recommendations as such, compare deadlines
precisely, and honestly refuse the inaccessible course's topic (isolation
held under a targeted probe).

## Adversarial security review → 5 fixes, all pinned

A read-only adversarial subagent reviewed the new scope layer. Its two real
finds:

1. **Global threads skipped the membership re-check on resume** — a student
   un-enrolled from a subject could still read that subject's stored evidence
   through an old global thread. Fixed: resume now re-derives the caller's
   CURRENT memberships and withholds sources per course (owner/student gating
   per relationship, same rules as readKnowledge). Proven live by an
   un-enroll/re-enroll probe in `verify:conversations`.
2. **`GET /api/ask` could spend money on a cross-site navigation**
   (SameSite=Lax). Fixed: POST-only, GET is 405 — pinned live.

Plus: the home→/ask carried question moved from `?q=` (an attacker-craftable
spend contract, and a re-ask on every reload after a failure) to a
sessionStorage key consumed once on mount; membership enumeration made
deterministic and enrolled-first (a faculty account's student life now
survives the cap); `requireRole` added to the global listing for consistency.
Deferred with eyes open (recorded in CONTEXT-HIERARCHY.md and the roadmap):
`readKnowledge`'s row-unbounded per-course read (the reader is closed v1.2.0
engine; bounded today by the 12-course cap and real volumes), the pre-existing
course-ask GET's same SameSite exposure (used by the lecture page and seven
suites — a follow-up, not a silent change), and the product-wide absence of
rate limiting.

## Design loop

Money guard extended first: `/api/ask` is now network-blocked during captures
(`/api/ask/conversations` stays allowed — it's a free read the seeded page
needs), regex verified against 12 URL cases. 18 full-page shots across
desktop/tablet/mobile (Student Home, /ask seeded with the eval thread, subject
ask, lecture chat). Three real defects found and re-verified in pixels:
`*emphasis*` rendering as literal asterisks (MarkdownAnswer now renders em,
with a non-space guard so arithmetic never italicizes), "FROM THE LECTURE"
labelling cross-subject evidence (heading now derives from the sources:
lecture/lectures/your subjects), and the home to-do card's ".," stutter when
joining sentence-shaped gap items. The mid-page sticky-header band in
full-page captures remains a known capture artifact, not a product bug.

## Verification totals

- Offline: **526 checks green** across all nine free suites (ask 79, answer 69,
  conversations 27, auth 25, extraction 76, transcript 33, reconstruction 63,
  knowledge-plan 47, providers 107).
- Live: **verify:conversations 47/47** — all three boundaries visible in
  sources, global create/resume/follow-up at $0, scope-borrowing 404s both
  directions, stranger 404s, GET-405, the un-enrollment withholding probe,
  meter honesty, cleanup. $0 by construction.
- tsc, eslint, production build: clean. Knowledge engine v1.2.0: untouched,
  still CLOSED.

## Spend

Gemini: 5 calls, 8,510 tokens (~₹0.12), all in the deliberate scope eval.
Sarvam: 0. Every other check in the milestone was free by construction.

## HUMAN-ONLY items open

1. Apply `supabase/migrations/20260906180000_ask_runs_global.sql` (drops NOT
   NULL on `ask_runs.course_id`), then re-run `npm run verify:conversations` —
   the global meter line currently reports `meter: "unavailable"` naming that
   migration; course/lecture metering is unaffected.
2. Google OAuth click-throughs (carried): allowlist `http://localhost:3500/**`
   in Supabase Auth, one Google signup per role.

## Not done, on purpose

The Adaptive Answer Experience milestone was explicitly out of scope and was
not started.
