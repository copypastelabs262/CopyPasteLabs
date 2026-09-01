# ClassMind V4 — the class shell

**Written 2026-09-02 (overnight autonomous build), before implementation. This is the
contract for tonight's work and the orientation document for tomorrow's engineer.**

V4 is the successor line. v3 froze at the pre-shell baseline the moment v4 was copied;
v2 remains the older frozen baseline. Port **3500**, package `classmind-v4`.

## Why v4 exists

Operator verdict on v3 (2026-09-02, after first real use): the app is organized around
the *pipeline* (upload → transcript → knowledge dump), not around the user's day. Opening
the app dumps everything; opening a lecture dumps all knowledge; Ask is a widget, not a
place; assignments have no home. The direction decided the same day: **steal the
classroom-app grammar, not the product** (`.knowledge/design/teams-grammar/grammar.md`) —
class rail, per-class destinations, stream-shaped home, chat-first Ask, confirm-as-posting
— with the Observatory visual system kept as the skin and Apple-HIG-grade craft standards
(clarity of hierarchy, one primary action per surface, generous space, restraint) as the
quality bar. Not a Teams clone, not a rebrand.

## The information architecture

```
/                      anonymous landing (unchanged)
/signin                unchanged
/courses               MY CLASSES — class cards + cross-class "what needs me" aggregate
/courses/:id           ┐ THE CLASS SHELL (new nested layout: rail + context header + tabs)
/courses/:id           │  ├─ Home        the class stream: what happened, what needs me
/courses/:id/ask       │  ├─ Ask         chat-first working surface (course-scoped)
/courses/:id/lectures  │  ├─ Lectures    recordings list + upload (owner) 
/courses/:id/lectures/:lectureId         lecture detail (route UNCHANGED — the ?t=
/courses/:id/assignments  └─ Assignments  citation contract keeps working untouched)
/privacy /terms        unchanged
```

**The load-bearing routing decision:** v4 does NOT move routes. `/courses/:id` becomes
the shell's Home tab; the lecture-detail URL — target of every stored citation link
(`KnowledgeUnit.tsx`'s `/courses/:c/lectures/:l?t=ms`) and ~25 hardcoded links mapped in
the archaeology pass — is untouched. Old links land in better places; nothing 404s;
no redirect layer to maintain.

## Shell composition

- `src/app/courses/[id]/layout.tsx` (new, server): resolves session, renders
  `<ClassShell>` around `{children}`.
- `_components/shell/ClassShell.tsx` (client): three regions —
  1. **Class rail** (desktop ≥lg): the user's classes from `GET /api/courses`, active
     class marked; "My classes" link to `/courses`. Collapses on mobile to a switcher in
     the context header.
  2. **Context header**: course code · title · term (+ join code chip for owner) — the
     persistent "you are here". One fetch of `GET /api/courses/:id` shared with tabs via
     context provider (`ClassDataProvider`), so the shell and tabs cannot disagree and we
     add no new endpoints.
  3. **Tab bar**: Home | Ask | Lectures | Assignments — `usePathname` for active state;
     owner-only affordances stay inside tabs, the tabs themselves are identical for both
     roles.
- Lecture detail renders INSIDE the shell (it is under `/courses/[id]/…`), giving it the
  rail + tabs for free — its own composition is otherwise untouched tonight.

## Tab contracts (all existing endpoints; zero new backend)

| Tab | Data | Content |
|---|---|---|
| **Home** | course payload + `GET /api/courses/:id/units` | Pinned "needs me" block (owner: pending reviews + blocked lectures; student: actionable todos), then a reverse-chron stream derived from real rows: lecture uploaded/processed/failed, assignment found→confirmed, topics captured per lecture. No metrics cards. Honest empty state. |
| **Ask** | `GET /api/courses/:id/ask?q=` | Chat-first: conversation column, composer fixed at bottom, answers with the existing citation rendering. Conversation is client-state only — no fake persistence, said in-UI. **Degraded mode becomes visible** (chip: "showing retrieved notes — AI answer unavailable") — fixes v3's silent-degradation gap; UI change only, provider logic untouched. |
| **Lectures** | course payload (+ existing per-row poll/progress components) | Owner: `LectureUpload` + the lecture rows (from FacultyWorkspace, re-homed). Student: the readable lecture list (from StudentCourseView, re-homed). |
| **Assignments** | `GET /api/courses/:id/units` filtered `category=actionable` | Owner: "Needs your review" queue (existing `POST /api/knowledge/:id/review` actions) + confirmed list. Student: confirmed assignments with steps/unspecified/evidence links. Due-date data does not exist in the model — nothing fake is rendered. |

`/courses` (My Classes): keeps `TeacherHome`/`StudentHome` content but reframed: class
cards primary, cross-class attention/todo aggregate (the Teams global-Assignments pattern,
from `/api/me/overview`) — light pass, after the class shell is done.

## What is deliberately NOT changing tonight

Providers, reasoning, extraction, storage, auth, database, deployment; the lecture
detail's internal composition (reading order, seek contract, review panel); the landing;
legal pages; v3 (byte-frozen); the dead legacy panels (`KnowledgePanel` legacy half,
`candidate_reviews` routes) — flagged for cleanup, not touched tonight. No chat, no
notifications, no submissions (grammar doc §3 rejections).

## Zero-spend state (verified before any code)

`GEMINI_API_KEY` and `SARVAM_API_KEY` are absent from v4's `.env.local` (header comment
in the file says why); reasoning refuses with its honest registry error; live
transcription cannot be enabled without `dev:spend`. The design-loop harness (ported,
baseUrl 3500) additionally aborts `/extract|/transcribe|/poll|/ask` and all six provider
hosts at the browser network layer and logs attempts to the run manifest. Screenshot runs
therefore *prove* zero spend rather than assume it. Note: the harness blocks `/ask`, so
Ask-tab captures show the pre-submit and manual states; degraded-mode rendering is
verified by direct interaction, where the absent key makes the call free and honest.

## Craft standards for the review passes (the "beautification" bar)

From Apple's HIG spirit, applied through Observatory tokens (no visual rebrand):
1. One focal surface and one primary action per screen; secondary content defers.
2. Hierarchy by type scale and space before boxes and borders — no card soup.
3. Generous whitespace; density is a choice, not an accident.
4. Navigation says where you are without being read twice (rail + context header + tab).
5. Motion only as feedback (existing `.motion-*` utilities), never decoration.
6. Empty/loading/degraded states designed with the same care as full states.

## Risks, stated

- **OAuth on 3500**: Google sign-in from `localhost:3500` silently lands on the Site URL
  until `http://localhost:3500/**` is added to the shared Supabase redirect allowlist —
  dashboard step, operator-only, documented in the handoff. Password sign-in (and the
  harness) is unaffected.
- The course page loses its everything-view; anyone used to v3's dump must learn four
  tabs. Mitigated by the tabs being the four questions users actually ask.
- `FacultyWorkspace`/`StudentCourseView`/`CourseClient` are re-homed, not rewritten —
  leftover seams are expected and the integration pass (Phase 7) exists to catch them.
- Mobile: rail collapses to header switcher; tab bar must remain reachable — verified in
  the capture pass at 390×844.

## Checkpoints

1. this document · 2. shell stable · 3. Ask · 4. Home · 5. Assignments · 6. integration
· 7. handoff (`V4-OVERNIGHT-REPORT.md`, morning review order included).
