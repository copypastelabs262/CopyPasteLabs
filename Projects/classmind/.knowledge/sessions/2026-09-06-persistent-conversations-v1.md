# 2026-09-06 — Persistent Conversations V1, and the Global Ask foundation

The infrastructure milestone behind the product loop: lecture → persistent
academic context → student conversation → ongoing academic memory. Autonomous
run per the operator's brief. **Gemini spend this milestone: 0 tokens so far**
— every live verification asks direct-route ($0) questions by construction;
the multi-turn quality eval is gated on the HUMAN-ONLY migration below.

## What was built

Full architecture doc: `product/classmind-v4/CONVERSATIONS.md`. The short
version:

- **Schema** (`20260906150000_conversations.sql`, WRITTEN NOT APPLIED):
  `conversations` (owner, scope 'lecture'|'course'|'global' with a CHECK
  making the three shapes the only representable ones, course/lecture refs,
  deterministic title, activity stamp) + `conversation_messages` (owner-
  denormalised, student/classmind roles matching AskTurn, content, payload
  jsonb carrying each answer's provenance — route/sources — so resuming
  renders what was actually shown, seq identity for ordering). RLS on, zero
  policies; ownership filtered into every query, so cross-student access has
  no code path.
- **Store** (`conversations.ts`, thin, injectable client) + **pure model**
  (`conversation-model.ts`: scope planning, scope non-bleed predicate,
  deterministic titles — never a model call — context caps, payload parsing).
- **Ask route integration**: `persist: true` creates a conversation from the
  first real question (page visits never create threads); `conversationId`
  continues one — the server loads the stored thread as conversational
  context and IGNORES client history. The stored scope is authoritative for
  retrieval (a lecture thread always retrieves within its lecture). Answers
  persist AFTER the meter so a persistence failure can never lose an
  answered, possibly-paid question. Question length capped (4K).
- **APIs**: list per surface (`/api/courses/[id]/conversations?lectureId=`),
  read + delete (`/api/conversations/[id]`), absent-and-not-yours identical
  404s.
- **UI**: AskWorkspace resumes ?c= or the scope's most recent thread on
  mount; conversation bar (current title · Recent popover · New); loading
  skeleton, resume-error recovery, URL sync so refresh/navigation land on the
  same thread; honest ephemeral fallback (footnote says answers aren't being
  saved) whenever the store is unavailable.
- **My Classes reframe (student)**: a "Pick up where you left off" band —
  the student's own recent conversations named academically (title +
  course/lecture), deep-linking back into the exact thread. Renders only
  when threads exist; no fake analytics, no empty promise cards.
- **Grounding untouched**: retrieval runs per question exactly as before;
  the teaching prompt and citation discipline are unchanged; conversation
  history remains context, never evidence.

## Verified

- Offline: **510 checks green** — the 483-strong existing regression plus 27
  new conversation-model checks (scope shapes, scope non-bleed, titles,
  caps, payload round-trip). tsc, eslint, `next build` clean.
- Live (degraded contract, $0): with the migration unapplied, listing
  answers `unavailable` naming the migration, ask still answers direct/$0
  with persistence honestly reported unavailable — 4/4 in
  `verify:conversations`, which flips to the FULL contract (resume,
  continuation, ordering, multiple threads, scope separation, cross-user
  404s on read/continue/delete, wrong-course refusal, meter honesty,
  cleanup) once the migration is applied.
- Visual: capture pass over ask-student / lecture-chat-student /
  my-classes-student at all three viewports — degraded mode renders the
  pre-persistence surface exactly, honest footnote included.
- Autosave: LOCAL-ONLY confirmed again (32 local checkpoints, origin
  untouched); no secret-shaped files among them.

## HUMAN-ONLY (blocking full verification)

1. **Apply `20260906150000_conversations.sql`** in the Supabase SQL editor,
   then: `npm run verify:conversations` (full live contract, $0) and one
   deliberate multi-turn quality eval (paid, small).
2. **Google OAuth click-throughs** (carried): allow-list
   `http://localhost:3500/**`, then Google signup once per role.

## Deliberately deferred

Global conversations route/UI (scope model only), thread renaming and
UI-deletion, per-user quotas, thread summarisation, streaming — recorded in
CONVERSATIONS.md so none of it is rediscovered as a surprise.

## Addendum: migration applied — full contract, paid eval, seeded design pass

The operator applied `20260906150000`. Everything gated on it then ran:

- **Full live contract: 27/27** in `verify:conversations` — create-by-first-
  question, resume, server-held continuation, ordering, listing, multiple
  threads, scope separation, cross-user 404s on read/continue/delete (the one
  initial failure was test setup: the "stranger" bounced off the course gate
  before ever reaching the ownership check; enrolling them made the ownership
  404 genuinely reachable — and it held), wrong-course 404, wrong-lecture 409,
  malformed-id 404s, meter honesty, cleanup.
- **Paid multi-turn eval over STORED threads** (3 scenarios, 8 model calls,
  **13,060 tokens ≈ ₹0.2** total): teach → "didn't understand the second
  part" (new angle, stored-history continuity) → example; Transformation →
  steps → "what did the lecturer ask us to write five times?" (precise,
  grounded [1]); assignment → "who has to do it?" → "when is it due?" — the
  audience chain answered **$0 direct with the lecturer's own words via
  stored-history retrieval augmentation**.
- **Two real defects caught and fixed** (then re-verified live):
  1. `retrieve()`'s short-words fallback returned arbitrary first units for
     "give me a real-world example", which suppressed the history
     augmentation (`hits.length < 2` was false) — the model then honestly
     denied knowing the topic. Fix: with a conversation in play, ALWAYS
     retrieve again with the recent exchange folded in and merge. Retry gave
     a grounded on-topic worked example.
  2. The direct deadline composer answered "the lecture didn't specify a
     deadline" while the summary said "submit it next week" — misleading at
     $0. Fix: temporal wording in the summary (`SUMMARY_TIME`, deliberately
     narrow) stands the composer down for the model, which answered: exact
     date unspecified [1], "submitted next week" [1]. Pinned in test:ask
     (now 71).
- **Seeded design pass (3 iterations)**: the resumed 5-answer thread rendered
  as a 10,349px wall because every answer repeated its full sources block.
  Fixed: on conversation surfaces, "From the lecture · N" and the gaps list
  fold into one disclosure per answer (citations auto-expand then travel).
  Page: 10,349px → ~3,600px; thread reads as a conversation. Student home
  verified with real threads: academic titles ("Cache scaling",
  "Transformation", "What assignment did sir give us") deep-linking into
  their exact threads.

**Final: 511 offline + 27 live checks green; tsc/eslint/build clean. Total
milestone Gemini spend: 13,060 tokens ≈ ₹0.2. Sarvam: 0.** Remaining
HUMAN-ONLY: the Google OAuth click-throughs (carried).
