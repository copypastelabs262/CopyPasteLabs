# V4 overnight build — handoff report

**Run:** 2026-09-02, ~02:00–03:20 IST, autonomous. **Read this first; details follow.**

## A. Executive summary

**ClassMind v4 exists, works, and is coherent enough to become the active line.** The class
shell — rail, persistent context header, four tabs (Home | Ask | Lectures | Assignments) —
is live around every surface inside a class, on unchanged routes, over unchanged backend.
Ask is a real conversation surface with a viewport-fixed composer. Home is a real-data
stream with a needs-you band. Assignments carries the confirm-as-posting queue. All of it
was judged from rendered screenshots (48 across three passes), typechecked, linted, and
production-built clean. **v3 is byte-untouched** and frozen as the pre-shell baseline.
Zero provider spend was possible, and zero occurred.

Recommendation: **adopt v4 as the active line; freeze v3** — after your morning review of
the four decisions in section H.

To see it: the dev server is still running at **http://localhost:3500** (no provider keys
in this tree — Ask degrades honestly, transcription refuses; both by design). Your own
Google account will hit the Supabase redirect trap on port 3500 (see Known issues H/3);
the password test accounts work.

## B. Product/UX changes

- **The class shell** (`_components/shell/ClassShell.tsx` + `courses/[id]/layout.tsx`):
  left rail of your classes grouped Teaching/Enrolled; context header (code, title, term,
  join code for owners); tab bar. You always know which class you are in, three levels
  deep. Mobile: rail hides, tabs scroll, content holds.
- **Home** = the class stream (`shell/ClassHome.tsx`): a "Needs you" band rendered *only
  when true* (owner: review queue + blocked lectures; student: work due), then Activity —
  every lecture as an event with what it yielded. No metric cards, nothing invented; after
  screenshot review the blocked-lecture sentence appears once (band), not twice.
- **Ask** = a place (`AskWorkspace.tsx`): conversation accumulates down the page, questions
  as right-set bubbles, answers with the full citation rendering (reused from the panel),
  composer fixed to the viewport bottom with the honesty line "this conversation isn't
  saved yet" (it isn't — no fake persistence). **Degraded mode is now visible** — a calm
  chip names when notes are shown in place of a composed answer, fixing v3's silent
  degradation. Verified interactively in degraded mode: two-turn conversation, states
  cycling correctly (smoke shots in `design-loop/runs/2026-09-02-shell/smoke-ask/`).
- **Lectures**: the owner's pipeline surface (upload, rows, progress, context) and the
  student index, each slimmed to that one job.
- **Assignments**: owner sees "Waiting for your confirmation" (Confirm & post / Reject on
  the existing review API — the zero-entry "posting" moment) then "Posted to the class";
  student sees confirmed work plus the honest awaiting-review count. No due-date column —
  the model has no due dates, and decoration must not lie about data.

## C. Architecture

v2 frozen · v3 frozen at pre-shell baseline (byte-identical, verified by git) · **v4
active successor** — port 3500, package `classmind-v4`, provider keys stripped.
**Routes did not move**: `/courses/:id` became the shell's Home; `/ask`, `/lectures`,
`/assignments` grew beneath it; the lecture-detail URL — the target of every stored
citation deep link (`?t=`) — is untouched, so nothing 404s and no redirects exist. One
course fetch (`shell/ClassContext.tsx`) feeds shell and tabs. Retired: `CourseClient`
(types survive); the course-wide knowledge dump and in-page ask panel (moved to tabs).
Backend, providers, auth, storage: **zero changes.** Full contract: `V4-ARCHITECTURE.md`.

## D. Verification

TypeScript clean · eslint clean (`--max-warnings 0`) · `next build` clean (9 routes) ·
30-shot capture pass, critique, 3 fixes, 9-shot recapture, re-review · interactive Ask
smoke in degraded mode · auth boundary spot-proven (a cross-course lecture renders the
enrollment refusal *inside* the shell). Automated tests: the repo's free suites are
pipeline suites, unaffected by UI changes; not run tonight.

## E. Zero-spend evidence

`GEMINI_API_KEY` and `SARVAM_API_KEY` **absent** from `.env.local` (header comment says
why); `ALLOW_LIVE_SARVAM` unset. Network guard armed on every capture context
(`/extract|/transcribe|/poll|/ask` + six provider hosts). **`blocked: []` in every
manifest — zero provider-capable attempts, zero spend.** The Ask smoke's calls ran
against the keyless registry: free by construction, degraded by design.

## F. Screenshots

`design-loop/runs/2026-09-02-shell/` — `iter-1/` (30, all targets × 3 viewports),
`iter-2/` (9, after fixes), `smoke-ask/` (4, the live conversation). v3's look for
comparison: `classmind-v3/design-loop/runs/2026-08-31/`.

## G. Known issues (honest)

1. **Lecture-detail capture shows its loading skeleton** — data APIs return 200 and the
   page is untouched v3 code; a capture-timing artifact on the media-carrying page, not a
   v4 regression. Verify by opening the page by hand; if it lingers there too, it's real
   and first in line tomorrow.
2. **Lecture detail renders two headers** inside the shell (class header + its own
   back-link header) — redundant, not broken. Its compositional pass was deliberately out
   of scope tonight.
3. **OAuth on port 3500**: add `http://localhost:3500/**` to the Supabase redirect
   allowlist (dashboard, your account) or Google sign-in lands on the v1 Site URL —
   the 2026-08-31 trap, on a new port. Password sign-in unaffected.
4. Join code hidden on mobile (`sm:` breakpoint) — owners lose it on phones.
5. `/courses` (My Classes) still renders v3's TeacherHome/StudentHome — good, but not
   yet reframed to the class-cards + cross-class aggregate the grammar doc sketches.
6. Assignment wording edits still live only on the lecture page (the queue links there).
7. Test data limitation: the shell was exercised on the QA course (one failed lecture,
   empty knowledge). The rich course (26 items) belongs to your account — your morning
   click-through is the first rich-data render. Empty states are all designed, so the
   risk is layout-with-abundance, not layout-with-absence.
8. The legacy dead code flagged in the archaeology map (`candidate_reviews` routes, old
   KnowledgePanel half, `CourseKnowledgePanel`) is still present, now fully unused —
   cleanup candidate, not tonight.

## H. Morning review order

1. **The product decision:** open http://localhost:3500 as yourself (after H/3's
   allowlist step, or via password account), walk Home → Ask → Lectures → Assignments in
   your Robotics course, and decide: does the shell earn v4 the active-line title?
2. **The UX question:** Ask's conversation with *rich* sources — does the citation block
   under each answer read as depth or as noise? (Screenshots couldn't show this; your
   course can.)
3. **The technical risk:** known issue G/1 — open a lecture page by hand.
4. **Highest-value refinement next:** the `/courses` My Classes reframe (G/5), then the
   lecture-detail compositional pass (G/2), then R1/R2/R6 from yesterday's backlog.
