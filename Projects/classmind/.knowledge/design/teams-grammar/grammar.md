# The classroom-app grammar — what we steal from Teams, and what we refuse

**Status:** Draft — built from Microsoft's public design documentation on 2026-09-02,
then verified the same day against nine screenshots of the operator's real student
account in live class teams ([`screenshots/`](screenshots/)). §4 records what the
screenshots confirmed, corrected, and still leave open (mobile).
**Rule of engagement:** we take interaction grammar and information architecture only —
never pixels, icons, branding, or Fluent's visual identity. The Observatory (our own
design system, `product/classmind-v3/`) stays the skin. Grammar and layout patterns are
not anyone's property; visual assets are.

**Sources (all public):**
- [Designing your Teams app — overview](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/design/design-teams-app-overview)
- [Teams app design fundamentals](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/design/design-teams-app-fundamentals)
- [Tab design (desktop, web, mobile)](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/design/tabs)
- [Assignments and grades in your class team](https://support.microsoft.com/en-us/education/assignments/assignments-and-grades-in-your-class-team)
- [Get organized in your class team](https://support.microsoft.com/en-us/teams/education/quick-start/get-organized-in-your-class-team)
- [Create an assignment in Teams](https://support.microsoft.com/en-us/education/assignments/create-an-assignment-in-microsoft-teams)

---

## 1. The grammar, as Microsoft documents it

### 1.1 Client anatomy (desktop)

Three nested navigation levels, left to right:

```
┌──────┬───────────────┬─────────────────────────────────────────┐
│ App  │  List / tree  │  Content canvas                         │
│ bar  │  (teams &     │  ┌─ Tab bar: Posts | Files | ... ─────┐ │
│ (icon│   channels,   │  │                                     │ │
│ rail)│   or chats,   │  │  the selected tab's content         │ │
│      │   per app-bar │  │                                     │ │
│      │   selection)  │  └─────────────────────────────────────┘ │
└──────┴───────────────┴─────────────────────────────────────────┘
```

- **App bar** — narrow icon rail, far left: Activity, Chat, Teams, Calendar, apps.
  Selecting an icon changes what the second column lists.
- **List/tree column** — the teams-and-channels tree (or chat list). This is where "my
  classes" lives.
- **Content canvas with a tab bar** — the selected channel's surface, organized as flat
  horizontal tabs (Posts, Files, plus added tabs). Tab content is a full-canvas webview.
- Documented tab anatomy: tab name, tab overflow menu, **tab-chat affordance (a
  conversation opened beside the content)**, content iframe.

### 1.2 Class-team anatomy (Teams for Education)

- Every class team has a **General channel**; its default tabs: **Posts** (the stream),
  **Files**, **Assignments**, **Grades**. More channels per unit/topic are optional.
- **Posts is the spine**: system events (assignment published, tab added) are posted into
  the stream automatically, so the stream doubles as the class's activity record.
- **Assignments tab**: list of assignments; teacher creates via a form (title,
  instructions, attachments, due date, close date, points). On Assign: **it auto-posts to
  the channel, notifies each student, links deep into the assignment, and can land on
  their calendar.** Students see per-assignment status (assigned/turned in/returned).
- **Grades tab**: matrix — assignments as columns, students as rows, ordered by due date.
- **Activity feed** (app-bar level): cross-class "things needing me", each entry a deep
  link.

### 1.3 Microsoft's own design rules worth keeping (they bind us too)

- **"Don't embed your entire app in a tab"** — multilevel navigation inside a tab is
  called out as information overload. Keep each surface to one job.
- **"Limit tasks and data"** — a tab addresses a specific need, not everything.
- **Activity without noise** — notify through the feed/stream with deep links rather than
  interrupting; move the relevant thread into view instead of shouting.
- Documented canvas patterns: **List, Task board, Dashboard, Form, Empty state**; left-nav
  inside a canvas only as a last resort.
- Layout is a 4 px grid; light/dark/high-contrast themes via tokens, never hard-coded
  color. (We already do tokens; the Observatory keeps its own.)

---

## 2. Adopt — the grammar mapped onto ClassMind

| Teams grammar | ClassMind surface | Notes |
|---|---|---|
| App bar + class list | **Left rail of classes** (merge to ONE column: rail lists classes directly — we have one app, not many) | Kills the current "everything dumped on home" |
| General channel's tab bar | **Per-class tabs: Home · Ask · Lectures · Assignments** | Flat tabs, one job each, per §1.3 |
| Posts stream | **Home**: reverse-chron stream of *pipeline events* — "lecture processed", "assignment found (needs your confirmation)" (teacher) / "assignment confirmed" (student), upcoming due items pinned on top | Our stream is written by the pipeline, not by people |
| Assignment creation form | **The confirm queue** — THE reframe: Teams makes the teacher type the form; ClassMind fills the form from the lecture and the teacher taps Confirm | The demo moment; treat Confirm as "posting" |
| Assign → auto-post + notify + deep link | Confirm → stream entry in Home + (later) student notification, deep-linked to the assignment with its evidence timestamps | Evidence-linked notification is the thing Teams cannot do |
| Tab-chat ("converse beside content") | **Ask** as a first-class tab: chat-first, composer fixed to viewport bottom, scroll never moves it | Matches the 2026-09-02 backlog item verbatim |
| Assignments list + per-student status | **Assignments tab**: list of confirmed Commitments, due-date ordered; status = confirmed/pending review (not turned-in/graded) | Status vocabulary is ours, not LMS's |
| Activity feed | Deferred — the Home stream covers it while classes-per-user is small | Revisit at multi-class scale |
| Grades matrix | **Rejected** (see §3) | — |

### Sequencing (queues behind the two-day backend brief)

1. **Ask tab, chat-first** — already on the roadmap backlog; smallest, highest-demand.
2. **Class shell** — rail + four tabs; mostly re-homing existing screens.
3. **Confirm-as-posting** — the confirm queue restyled as the "assignment posted" moment,
   writing into the Home stream.
4. **Notifications** — only when a real pilot demands them; digest-style, deep-linked.

## 3. Reject — deliberately, with reasons

- **Person-to-person chat, channels-as-conversation, meetings** — communication is Teams'
  product and Microsoft's moat; colleges already have it free. ClassMind is the memory
  layer beside it, not a replacement.
- **File submission / turn-in / Grades matrix** — that's an LMS; a different compliance
  and consent surface, quarters of commodity work, zero differentiation.
- **Multiple channels per class** — one class = one stream until real use proves
  otherwise; channels exist because Teams hosts conversations, which we don't.
- **Fluent visual identity** (Segoe, Fluent icons, Teams color tokens) — grammar yes,
  skin no. The Observatory stays.

## 4. What the screenshots settled (2026-09-02, student account, live class teams)

**Corrections to §1 — the current EDU client differs from the generic docs:**

- **Navigation is two-level, and the per-class nav list is primary.** Entering a class
  shows a left column of class sections — *Home page · Class Notebook · Classwork ·
  Assignments · Grades · Reflect* — with channels ("Main Channels → General") below
  them, and only *then* the channel's tab bar (**Posts | Shared** — "Files" is now
  "Shared"). For ClassMind's four destinations a single flat tab bar is still the right
  call (Microsoft's own guidance: limit nav), but the observed grammar is rail → class →
  section list → tabs.
- **The class list groups "Classes" separately from ordinary "Teams"** — class-ness is a
  first-class concept, not a naming convention. Cards carry name + avatar only.
- **Assignments exist twice**: as a section inside each class AND as a global app-bar
  destination aggregating every class — tabs *Upcoming | Past due | Completed*,
  date-grouped, each row carrying its class name, a red "You have past due assignments"
  banner on top, and a "Further out" divider. **Adopt this aggregate shape for the
  student home's due-items view** — it is exactly what our cross-course "catch up"
  wants to be.

**Confirmations:**

- **The class stream is announcement-shaped in real use.** The student account is muted
  in a class ("You've been muted, so you can't start a conversation") — teachers run
  Posts as a broadcast surface. Our pipeline-written stream isn't a compromise; it
  matches observed practice.
- **Assignment detail order (student view):** title → due + submission policy →
  Instructions (prose, incl. file-name format!) → Reference materials → My work
  (Attach/New) → Points and status on the right → **Turn in** as the single primary
  action, top-right. Our assignment detail mirrors this order, with Confirm (teacher) /
  evidence timestamps (student) where Turn in sits.
- **Ask's composer needs nothing but text + send.** The heavy composer (format, emoji,
  attach, loop) belongs to social chat — which lives OUTSIDE the class anyway: the real
  collaboration observed happens in a self-organized 31-member group chat, not in the
  class team. Strongest possible evidence for the §3 rejection of building chat — the
  audience already has chat and uses it; the class team is used for *structure*
  (assignments, materials, announcements).
- **Materials in practice** = teacher-uploaded PDFs/PPTs in a pinned "Class Materials"
  folder under Shared. Maps to our course-context uploads; a browsable Materials
  surface is a later, cheap addition to the Lectures tab, not a new system.
- One more gap confirmed in our favour: Teams' "Recap/Recording is ready" exists only
  for *online meetings*. The in-room lecture — everything ClassMind processes — has no
  capture path in Teams at all.

**Still open (needs 2–3 phone screenshots when convenient):**

1. How mobile Teams collapses the shell — what earns a bottom-nav slot, and where
   Assignments goes on a phone.
2. What the assignment detail drops first under mobile compression.

## 5. What this feeds

This document + the screenshots become the **design-loop brief** for the shell rework —
the loop's next run iterates the IA against real rendered screens, same harness, same
paid-endpoint network guard, with the Observatory identity untouched as the skin.
