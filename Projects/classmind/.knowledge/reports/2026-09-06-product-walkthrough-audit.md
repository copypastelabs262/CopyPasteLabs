# ClassMind v4 — Product Walkthrough Audit

**Date:** 2026-09-06 · **Perspective:** founder / brutally-observant first-time user · **Method:** walked the *running* app, not the code first.

Companion: **`2026-09-06-product-walkthrough-audit-full-issues.md`** holds every one of the 99 findings as a full `[ISSUE]` block. This document is the analysis: what to fix first, and why.

---

## How this was done (so you can trust it)

Chrome automation is off in this environment, so I drove the **real running app** on `localhost:3500` with the Playwright capture harness — signed in as the seeded **student** and **faculty** accounts, visited **every route**, opened interaction states (New/Recent, user menu, create-course modal), and captured **43 screenshots** across desktop / tablet / mobile. The money guard was armed the whole time — **0 paid requests fired**. I read the key screens myself, then ran a **12-area audit across 118 agents**, where **every finding was adversarially verified** against the screenshot and the source before it survived. 106 raw findings → **97 verified, 9 rejected**. I manually reinstated 2 the verifier under-weighted (the faculty gate — confirmed by code grep — and in-browser recording), giving **99**.

**Coverage:** anon landing + sign-in; student home / global Ask / course home / lectures / assignments / subject Ask / lecture Ask; faculty home / course / lectures (failed + pending states) / assignments / create-course; user menu; loading & error states. Live *answer quality* was out of scope (dev build has no model key) — this is an **interface / IA / navigation / copy** audit.

**Severity counts:** Critical 1 · High 5 · Medium 35 · Low 58.
**Classification counts:** BROKEN 8 · MISSING 18 · CONFUSING 26 · UNNECESSARY 6 · UX IMPROVEMENT 26 · WORKING 13 · FUTURE OPPORTUNITY 2.

**The one-sentence verdict:** ClassMind's *content* — grounded, cited, honest states — is genuinely excellent; its *product shape* is not yet built around its own core verb. The app still presents as a **to-do dashboard** where the founder's intent is an **Ask-first academic brain**, the flagship Global Ask **isn't in the navigation and has no conversation sidebar**, faculty are treated as **uploaders with no Ask of their own**, and **anyone can make themselves Faculty**.

---

## TOP 10 — fix these first

### 1. [ISSUE] Anyone can self-select Faculty — there is no verification gate
- **Location:** `src/app/choose-role/ChooseRoleForm.tsx:49-71`, `src/app/signin/page.tsx:138-155`, `src/app/api/profile/route.ts` (POST role)
- **What I did:** Went through onboarding and picked "Faculty"; grepped the codebase for any faculty code/secret/verification.
- **What happened:** Faculty is a plain button. Clicking it POSTs `{role:"faculty"}` with no code, secret, or approval. A grep for any faculty gate returns **zero** hits.
- **What I expected:** Faculty registration gated behind a private faculty-only code so students can't self-provision teaching accounts.
- **Why it's a problem:** One click grants anyone the ability to create courses, upload lectures, and enter the teaching console. This is your explicit Part-1 requirement and a real integrity gap. (The automated verifier wrongly rejected this; manual code inspection confirms no gate exists — I reinstated it.)
- **Severity: Critical · MISSING** — **Direction:** server-validated faculty code at role selection (both surfaces), checked in `/api/profile` before writing `role=faculty`.

### 2. [ISSUE] The homepage is a to-do dashboard, not an Ask-first brain
- **Location:** `src/app/_components/StudentHome.tsx:212` (title "Catch up") + the whole stacked feed
- **What happened:** The page leads with "**Catch up / 2 things to do across 3 courses**." The Ask composer is the *second* block, above a full assignment feed, a "Your courses" rail, "Pick up where you left off" (6 rows), and "Recently added." It reads as a dashboard.
- **What I expected:** Simple greeting + Global Ask + minimal noise; the purpose obvious in seconds.
- **Why it's a problem:** The product's core action is buried under a to-do framing and four dashboard sections a returning student scrolls past every visit.
- **Severity: High · CONFUSING** — **Direction:** make Ask the hero (greeting + composer as the H1 zone); demote or trim the to-do feed, cap "pick up" to ~3 rows, drop "Recently added." Let the composer, not lists, be the page.

### 3. [ISSUE] Global Ask hides conversations in a dropdown and can't manage them
- **Location:** `src/app/_components/AskWorkspace.tsx:418-455` (Recent dropdown), `:232` (always-new)
- **What happened:** Previous conversations live behind a top-right "**Recent ▾**" dropdown, not a left sidebar. There is **no rename/delete**, and asking the same thing from home **spawns duplicate threads** (visible as indistinguishable rows in "Pick up where you left off").
- **What I expected:** A persistent workspace: New Chat, a vertical left conversation sidebar, click-to-resume, manageable threads.
- **Why it's a problem:** The flagship surface doesn't feel like the intended AI workspace; the wide empty left gutter already exists to hold the rail.
- **Severity: High · MISSING** — **Direction:** promote conversations to a permanent left rail (collapsible to the dropdown on mobile); add delete/rename; resume-or-new from the home hero instead of forcing new.

### 4. [ISSUE] The flagship verb isn't in the navigation
- **Location:** `src/app/layout.tsx:79-96` (nav has only "Courses"); `StudentHome.tsx:102` (only launcher)
- **What happened:** `/ask` is reachable **only** from the student home hero. It has no nav entry and no in-course path; faculty can only reach it by typing the URL.
- **What I expected:** "Ask" as a persistent, top-level destination — the product's verb.
- **Why it's a problem:** From a course, a lecture, or the faculty console you cannot get to Global Ask without going home first.
- **Severity: High · MISSING** — **Direction:** add a persistent "Ask" link to the global nav beside "Courses."

### 5. [ISSUE] Faculty have no Ask and no workspace — only an upload console
- **Location:** `src/app/_components/TeacherHome.tsx:94-299`; `src/app/ask/page.tsx:24-34` (student-framed); `fac-global-ask--desktop.png`
- **What happened:** Faculty home is purely operational (upload / triage). There is **no Ask entry anywhere** in the faculty chrome. The one Global Ask that *does* load for faculty (by URL) is written for students ("assignments, deadlines, what to work on").
- **What I expected:** Faculty as first-class — at minimum an Ask-over-my-courses surface, framed for teaching.
- **Why it's a problem:** The retrieval brain already exists; it simply isn't offered to faculty, so faculty feel like an afterthought.
- **Severity: High · FUTURE OPPORTUNITY / MISSING** — **Direction:** a faculty-scoped Ask (their taught courses) with teaching prompts; grow toward planning/prep later.

### 6. [ISSUE] Faculty "Recent lectures" leaks a course they only joined as a student (and a 403 link)
- **Location:** `src/app/api/me/overview/route.ts:125-131,379-383`; `TeacherHome.tsx:205`; `fac-home--desktop.png`
- **What happened:** The "every course you teach" feed pulls in lectures from a course the faculty member is *enrolled in as a student*, producing a card whose link 403s for them.
- **Why it's a problem:** It contradicts its own label and hands the user a dead/forbidden link.
- **Severity: High · BROKEN** — **Direction:** scope faculty `recentLectures`/`processingCount` to **owned** courses only.

### 7. [ISSUE] The awaiting-upload lecture page promises a transcript that doesn't exist, with a spinner that never stops
- **Location:** `fac-lecture-pending--desktop.png`; `LectureClient.tsx:373-378,457,593-597`; `AudioPlayer.tsx:104-113`
- **What happened:** A lecture with **no recording yet** shows an animated **spinner** (implying active work) and a "Full lecture" section whose copy claims "the transcript below is complete" — there is no transcript.
- **Why it's a problem:** Two false signals on one screen: perpetual-loading on a stalled state, and a promised artifact that isn't there.
- **Severity: High · BROKEN** — **Direction:** static idle icon for `pending_upload`; gate the "Full lecture"/transcript block on a transcript actually existing.

### 8. [ISSUE] A failed lecture gives contradictory causes and fixes on the card vs the detail page
- **Location:** `fac-home--desktop.png` (card) vs `fac-lecture-failed--desktop.png` (detail); `LectureUpload.tsx:72-87`
- **What happened:** The home card says the failure is **"transcription ran out of credits… it can be transcribed once credits are restored."** The detail page for the same failure says **"This recording could not be processed… play it and check it's audible, upload a clearer copy, change the language."**
- **Why it's a problem:** Same failure, two different diagnoses and two different fix paths — the faculty member can't tell what's actually wrong.
- **Severity: High · CONFUSING** — **Direction:** drive both surfaces from the same failure *kind*; show credits-explanation + "retry when restored" for the credits failure, audio-troubleshooting only for genuine audio failures.

### 9. [ISSUE] "What you have to do" is the same section, same cards, on three screens
- **Location:** `StudentHome.tsx:219` (global home) · `shell/ClassHome.tsx:125` (course Home tab) · `shell/ClassAssignments.tsx:96` (Assignments tab)
- **What happened:** The identical assignment card (title, 4 steps, "not specified," lecture quotes) renders on the global home, the course **Home** tab, and the course **Assignments** tab. The course Home tab's "Activity" list *also* duplicates the Lectures tab.
- **Why it's a problem:** Three-fold redundancy; the course Home tab has no reason to exist as its own thing.
- **Severity: Medium→High · UNNECESSARY** — **Direction:** let Assignments own the full card; make course Home a lean launcher (or make **Ask** the course landing) that summarizes and links, never re-renders.

### 10. [ISSUE] The primary "Upload lecture" CTA lands on a page with no upload control
- **Location:** `CoursesClient.tsx:366` (`href=/courses/{id}` → Home tab); `fac-home--desktop.png`
- **What happened:** The faculty home's primary button is "Upload lecture," but it navigates to the course **Home** tab, which has no dropzone. (The uploader lives on the Lectures tab.)
- **Why it's a problem:** The single most important faculty action leads to a dead end; a first-time faculty user is stranded.
- **Severity: Medium · BROKEN** — **Direction:** point the CTA at the Lectures tab (or add the dropzone to Home). Label and destination must match.

---

## Problems by area

Each list is ordered most-severe first. Full `[ISSUE]` detail for every line is in the companion file.

### Authentication & onboarding (8)
- **Critical/MISSING** — No faculty verification gate (Top 10 #1).
- **Medium/MISSING** — Onboarding captures *only* a role; no name for Google users (relies on Google metadata; blank if absent), no first course-join step.
- **Medium/MISSING** — A mis-picked role is permanent with no self-service recovery (`/api/profile` refuses changes; no re-entry path).
- **Low/WORKING** — New Google users are correctly routed to `/choose-role`, not dumped on the homepage; `ensureProfile` is insert-only so re-sign-in never overwrites a role. *Keep this.*
- **Low/CONFUSING** — The inline signup role toggle has no explanation while `/choose-role` does — inconsistent for a permanent choice.
- **Low/UX** — Role order/casing differ between the two pickers (faculty-first lowercase vs student-first Title Case); Faculty shouldn't be the default-left option.
- **Low/UX** — Landing + header only ever say "Sign in" — no "Get started" for a first-time visitor.
- **Low/CONFUSING** — Landing step-03 copy is garbled ("Only the things students must act on wait for a human").

### Homepage (7)
- **High/CONFUSING** — Dashboard framing, Ask is second (Top 10 #2).
- **Medium/UX** — On tablet/mobile, "Your courses" is pushed below the *entire* to-do feed.
- **Low/UNNECESSARY** — "Pick up where you left off" + "Recently added" are two more below-fold dashboard sections.
- **Low/UX** — Desktop right rail leaves a large empty column under "Your courses."
- **Low/UX** — The Ask hero carries a long marketing paragraph re-read every visit.
- **Low/UX** — A "0 lectures" course is a tappable row that leads into an empty course with no pre-tap signal.
- **Low/WORKING** — The composer + its sessionStorage cost-safety design are sound. *Preserve exactly.*

### Global Ask (10)
- **High/MISSING** — No left sidebar; conversations in a "Recent" dropdown (Top 10 #3).
- **Medium/BROKEN** — Same question from home spawns duplicate conversations.
- **Medium/MISSING** — No rename/delete/manage for conversations.
- **Medium/UX** — Huge desktop dead space; content trapped in a narrow left-of-center column.
- **Low/MISSING** — No persistent nav entry for `/ask` (Top 10 #4).
- **Low/CONFUSING** — Heading/framing on `/ask` differs from the home Ask hero for the same feature.
- **Low/CONFUSING** — Empty-state Ask button renders faint/secondary, reading as disabled.
- **Low/UX** — Active-conversation title is a mono "chip" that reads as a tag, not a heading.
- **Low/UX** — Suggestion prompts differ across the three Ask surfaces.
- **Low/WORKING** — The provenance chip + collapsed "From your subjects" grouping are the strongest part of the surface. *Keep.*

### Lecture Ask (6)
- **Medium/BROKEN** — Scope contradiction: placeholder says "this lecture," the caption under it says "this class's lectures."
- **Low/CONFUSING** — The chat thread has no bottom edge; it bleeds straight into "What was taught" / "Full lecture."
- **Low/MISSING** — The conversation region has no heading — only the composer footnote identifies it as Ask.
- **Low/UX** — Mobile composer placeholder clipped to "…this lectun."
- **Low/UX** — Conversation title rendered as a monospace code-chip.
- **Low/WORKING** — Lecture Ask correctly **reuses the same chat component** as course/global Ask, scoped to the lecture. *This consistency is right — keep it.*

### Navigation (8)
- **Medium/MISSING** — User menu is a dead-end dropdown: only account info + Sign out (no Profile, Settings, Home, Assignments).
- **Medium/BROKEN** — Inside a course on **mobile/tablet** there is **no back link and no course switcher** — the rail is `hidden lg:block`.
- **Medium/CONFUSING** — Three different nav paradigms: thin top bar (global) vs rail+tabs (course) vs no chrome at all (`/ask`).
- **Low/MISSING** — `/ask` has no persistent nav entry / no in-course path.
- **Low/CONFUSING** — Naming: "Courses" vs "classes" vs "Teaching/Enrolled" for the same concept.
- **Low/UNNECESSARY** — Wordmark and "Courses" both go to `/courses`; neither is labeled "Home."
- **Low/MISSING** — No global Assignments destination despite the home's cross-course "What you have to do."
- **Low/WORKING** — The in-course tab bar (persistent Ask + clear active state) is genuinely good. *Use it as the reference model.*

### Course experience (8)
- **Medium/UNNECESSARY** — Course Home tab = Assignments + Lectures re-rendered a third time (Top 10 #9).
- **Medium/CONFUSING** — Two enrolled courses both titled "Cloud Computing," separable only by a code (CC101 vs TEST2).
- **Medium/CONFUSING** — "What you have to do" heads *both* Home and Assignments with the same cards.
- **Medium/UX** — First impression of a course is one giant assignment card; class activity pushed below the fold.
- **Low/UNNECESSARY** — Home "Activity" list = the Lectures tab list, same rows and destinations.
- **Low/UX** — The class rail vanishes on mobile with no replacement switcher.
- **Low/WORKING** — Empty course shows an honest, well-written empty state.
- **Low/WORKING** — **Subject-scope Ask is a genuinely strong surface — consider making it the course landing.**

### Faculty experience (9)
- **High/BROKEN** — "Recent lectures" leaks an enrolled-as-student course + 403 link (Top 10 #6).
- **High/FUTURE** — Faculty home is a pure upload/triage console with no teaching intelligence (Top 10 #5).
- **Medium/MISSING** — No faculty Ask entry point anywhere in the chrome.
- **Medium/CONFUSING** — The only Global Ask is student-framed; a faculty member lands in a screen written for someone else.
- **Medium/CONFUSING** — Faculty "Your courses" rail mixes taught + enrolled courses undifferentiated.
- **Medium/MISSING** — Faculty can't create/post an assignment; assignments only arrive via lecture reconstruction.
- **Low/UX** — The course Ask tab (only Ask faculty can reach) is student-framed.
- **Low/UX** — On mobile, the lecture status pill drops below the descriptive text.
- **Low/WORKING** — The primary action resolves intelligently to the user's actual next step. *Keep this discipline.*

### Faculty recording / upload (10)
- **High/BROKEN** — Awaiting-upload page promises a non-existent transcript (Top 10 #7).
- **High/CONFUSING** — Failed-lecture card vs detail give contradictory causes/fixes (Top 10 #8).
- **Medium/BROKEN** — "Upload lecture" CTA lands on a page with no upload control (Top 10 #10).
- **Medium/CONFUSING** — Create-course language helper reads as a cryptic bug report ("Auto-detect once romanized an English lecture into Arabic. Pick what you teach in.").
- **Low/CONFUSING** — Status vocabulary inconsistent across badges, eyebrows, and detail banners.
- **Low/CONFUSING** — Awaiting-upload uses a spinner icon on a terminal stalled state.
- **Low/UX** — Two lectures with identical title "Robotics and Automation trial" indistinguishable in the feed.
- **Low/CONFUSING** — "Delete this recording" offered on a lecture that has no recording.
- **Low/WORKING** — **Failure copy is genuinely excellent** — reassures what survived and what to do.
- **Low/FUTURE** — No in-browser recording; upload is the only input (your Part-8 second-input, noted, not to build yet).

### Profile / account (6)
- **Medium/MISSING** — No `/profile` page exists; the dropdown is the entire account surface.
- **Medium/MISSING** — Cannot edit your name anywhere, even though `/api/profile:71-77` already accepts a `fullName` update.
- **Medium/MISSING** — No settings of any kind (notifications, appearance, language, security).
- **Medium/MISSING** — Role is shown with no path to correct a wrongly-set role.
- **Low/MISSING** — No avatar; only a derived initial with no way to set an image.
- **Low/WORKING** — The identity caption (name/email/role, null-safe) is well-built — keep it as a future profile page's header.

### Loading / system states (5)
- **Medium/BROKEN** — Animated spinner on the settled "no recording yet" dead-end (reads as perpetually loading).
- **Medium/BROKEN** — "Full lecture" placeholder claims "transcript below is complete" when there is none.
- **Low/WORKING** — **Ask loading states are excellent** — content-shaped skeletons in a single `aria-live` region, no generic spinner. *Reference pattern.*
- **Low/WORKING** — **The processing pipeline is a branded 5-stage narrative track** ("TRANSCRIBE · FAILED HERE"), not a corner enum — the strongest system-state affordance in the app.
- **Low/UX** — No route-level `loading.tsx` boundaries; loading depends entirely on per-component client skeletons.

### Dead / non-functional / redundancy (8)
- **Medium/MISSING** — Global Ask has no persistent nav entry (cross-ref #4).
- **Medium/UNNECESSARY** — **Dead code:** an entire second Ask implementation (`AskPanel`, titled "Ask ClassMind") is never rendered; delete it (keep the exported `AnswerView`/`Looking`/`SUGGESTIONS` helpers).
- **Medium/CONFUSING** — The Ask feature is named **four** different ways across the surfaces that launch/host it.
- **Medium/CONFUSING** — "Pick up where you left off" shows indistinguishable duplicate rows (no timestamp/preview/dedup).
- **Low/CONFUSING** — Ask submit button is solid-primary on the home hero but faint-secondary everywhere else.
- **Low/UNNECESSARY** — "What you have to do" on three screens (cross-ref #9).
- **Low/UX** — The global header carries two links to the same destination (wordmark + "Courses").
- **Low/UX** — Home-hero and `/ask` suggestion chips are different sets.

### The non-developer test (14)
- **Medium/CONFUSING** — Landing offers no way to create an account — only "Sign in" (twice).
- **Medium/UX** — Global Ask on mobile: composer sits under content with a huge empty void beneath.
- **Medium/CONFUSING** — Two different courses both display as "Cloud Computing."
- **Medium/CONFUSING** — Faculty course cards show a raw hex string with no label.
- **Medium/UX** — Lecture chat has a large empty band between composer and "What was taught."
- **Low ×9** — Dead space in the Ask empty state; Ask named three ways; duplicate faculty lecture titles; "Answered straight from the stored lecture knowledge." repeated on every answer; **pervasive test/seed naming leaking into the UI** ("Test," "Test1," "QA-BROWSER," "CC Lec1"); mobile placeholders clipped mid-word; home repeats the full 4-step assignment breakdown; landing step-03 hard to parse; **and one WORKING note** — honest, grounded, cited states are handled genuinely well.

---

## What's genuinely good (don't lose it in a redesign)

1. **The grounded, cited, honest content** — every answer traces to a timestamp; "not specified" is stated as information; the failed-lecture screen tells faculty exactly what survived and what to do. This is the product's soul.
2. **The landing page** — the "Trace" demo card (question → highlighted quote → "spoken at 42:17" → waveform) is the best sixty pixels in the building.
3. **Ask loading states + the 5-stage pipeline track** — polished, branded, informative.
4. **Lecture/subject/global Ask share one chat component**, correctly scoped — the consistency the founder wants for Part 4 already holds under the hood.
5. **Auth correctness** — insert-only provisioning, role never silently overwritten, new Google users routed to onboarding.
6. **Subject-scope Ask** — a strong, well-scoped surface that deserves to be the course's front door.

## Future product opportunities (noted, not for now)

- A **faculty AI workspace** (Ask-over-my-courses → planning, prep, "what did students most ask about," material generation). The retrieval brain already exists.
- **In-browser lecture recording** as the second input alongside upload.
- **Faculty-authored assignments** (reconstruction as the assist, not the only channel).
- A **global Assignments view** aggregating across courses.

## Adversarial verification note

9 findings were rejected by the verification pass as invented, misread, or duplicate. I reinstated **two**: the faculty gate (Critical — the verifier erred; grep + `ChooseRoleForm.tsx` confirm no gate) and in-browser recording (your explicit Part-8 future item). The rest (e.g. a mobile sticky-nav overlap that was a capture artifact, a couple of homepage duplicates) were correctly dropped.

## Suggested sequence (when you move from audit → build)

1. **Faculty gate** (Critical, security).
2. **Make Ask navigable and Ask-first**: add "Ask" to the nav; give Global Ask a left conversation rail + manage; make the home Ask-first. (#2–#4)
3. **Fix the broken faculty/processing states**: owned-only recent lectures, the awaiting-upload transcript/spinner lies, the failed-lecture contradiction, the upload CTA destination. (#6–#8, #10)
4. **Collapse the redundancy**: one home for assignments; make course Home a launcher or land on Ask. (#9)
5. **Give faculty an Ask** and a real Profile/Settings surface.
6. Polish: naming consistency, mobile back/switcher, seed-data cleanup, copy fixes.

*No production code was changed during this audit.*
