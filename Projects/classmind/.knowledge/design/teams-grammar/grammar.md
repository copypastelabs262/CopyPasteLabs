# The classroom-app grammar — what we steal from Teams, and what we refuse

**Status:** Draft — built from Microsoft's public design documentation on 2026-09-02.
Awaiting the operator's screenshots in [`screenshots/`](screenshots/) to verify against the
*experienced* product; the open questions in §4 are what the screenshots settle.
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

## 4. What the operator's screenshots must settle (open questions)

1. Where does the eye land first inside a class — Posts or the tab bar? (Decides whether
   Home or Ask is our default tab.)
2. How does the assignment *detail* page order title / due / instructions / attachments —
   and what does its mobile compression drop first?
3. How does the stream visually separate system posts ("assignment posted") from
   discussion? (Our stream is all system posts; the styling lesson still matters.)
4. How does mobile Teams collapse the three columns into bottom-nav — what survives as a
   top-level destination? (Our students will live on phones.)
5. What does the composer do beyond text (attach, mention, format) — and which of those
   does Ask genuinely need? (Suspected answer: none.)

## 5. What this feeds

This document + the screenshots become the **design-loop brief** for the shell rework —
the loop's next run iterates the IA against real rendered screens, same harness, same
paid-endpoint network guard, with the Observatory identity untouched as the skin.
