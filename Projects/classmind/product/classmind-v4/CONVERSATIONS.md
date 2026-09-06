# Persistent Conversations V1 (2026-09-06)

Why: the product loop is lecture → persistent academic context → student
conversation → ongoing academic memory. Ask became a real conversation surface
on 2026-09-06 but the thread lived in component state — a refresh ended it.
This milestone makes conversations REAL: stored, owned, resumable — and lays
the scope model Global Ask will widen later.

## Schema — migration `20260906150000_conversations.sql`

`conversations`: id, owner_id (auth.users, cascade), **scope**
('lecture'|'course'|'global'), course_id, lecture_id, title, created_at,
last_message_at. A CHECK constraint makes the three scope shapes the only
representable ones (lecture ⇒ course+lecture, course ⇒ course only, global ⇒
neither). Indexed for "my threads here, newest activity first".

`conversation_messages`: id, conversation_id (cascade), owner_id
(denormalised), role ('student'|'classmind' — the same voices `AskTurn`
speaks), content, **payload jsonb** (assistant rows only: route, degraded,
knowledgeUnitsAvailable, sources — the answer's provenance, so a resumed
thread renders exactly what was shown live), **seq** (identity — monotonic
ordering that timestamps can't tie), created_at.

## Ownership / security

Same structural model as every product table: **RLS on, zero policies** — the
anon key cannot touch these tables at all; only service-role server routes
can, and **every query filters `owner_id` to the session user** (the query
that could read another student's thread does not exist). "Absent" and
"someone else's" return the same 404 so a guessed id learns nothing — reads,
continuations and deletes alike. Cross-user access is covered by live
negative tests in `verify:conversations`.

## Lifecycle

- **Created by the first question, never a page visit** — the ask route's
  `persist: true` creates the conversation and stores the first exchange;
  there is deliberately no create endpoint, so empty threads cannot exist.
- **Continued** with `conversationId` on the ask POST. The server loads the
  stored thread as the model's conversational context and **ignores client
  history** — the thread on disk is the truth; a client cannot inject a
  conversation that never happened.
- **Titled deterministically** from the first question
  (`deriveConversationTitle` — boilerplate stripped, word-boundary cut).
  Never a model call: a title is a label, not a synthesis.
- **Resumed** via `GET /api/conversations/[id]` (identity + ordered messages
  with payloads); listed per surface via
  `GET /api/courses/[id]/conversations[?lectureId=]`. The UI resumes `?c=`
  or the scope's most recent thread; refresh, navigation and return all land
  on the same thread. **Deleted** by its owner (`DELETE`; messages cascade).

## Conversation context vs academic grounding

The two are different inputs and both always run:

- **Retrieval is the academic grounding** — unchanged: `readKnowledge` over
  the conversation's OWN scope (a stored lecture thread always retrieves
  within its lecture, whatever the request says), then the teaching prompt's
  grounding contract (lecture facts cited, explanation never attributed).
- **The stored thread is the conversational context** — the last
  `CONTEXT_MESSAGES` (12) messages become `AskTurn`s, capped again by
  answer.ts (8 turns / 1.5K chars each). History influences interpretation
  and follow-ups; it never replaces retrieval, is never cited, and never
  becomes knowledge.

## Metering

Unchanged: one `recordAskRun` per ask, direct routes at $0, persistence adds
zero model calls (titles are deterministic; storage is storage).

## Global Ask foundation (built later the same day)

The scope model was laid here as a foundation, and the Context Hierarchy
milestone built on it hours later: `/api/ask` now serves scope 'global' by
widening retrieval across the student's memberships over the SAME canonical
knowledge — no second knowledge layer, no new tables, exactly as planned.
The whole three-boundary architecture lives in **CONTEXT-HIERARCHY.md**.

## Degradation

Until the migration is applied everything degrades, nothing breaks: listings
answer `state: "unavailable"` naming the migration, ask still answers with
`conversation.state: "unavailable"`, the UI runs the pre-persistence
ephemeral contract and its footnote says answers aren't being saved.
`verify:conversations` verifies whichever contract the database is in.

## Deliberately deferred

- ~~Global conversations UI/route~~ — built the same day (CONTEXT-HIERARCHY.md).
- Renaming threads; deleting from the UI (API exists; a destructive control
  needs its own confirm pass).
- Per-user conversation quotas / rate limiting (product-wide concern, not a
  conversations concern).
- Summarising long threads instead of windowing the recent tail.
- Server-side streaming.

## Tests

- `test:conversations` (offline, 27): scope shapes, scope non-bleed, titles,
  context caps, payload round-trip.
- `verify:conversations` (live, $0 by construction — direct-route questions
  only): create-by-first-question, resume, continuation via server history,
  ordering, listing, multiple threads, scope separation, cross-user 404s on
  read/continue/delete, wrong-course refusal, meter honesty, cleanup. Runs
  the degraded-contract variant while the migration is unapplied.
- Multi-turn ANSWER quality: `eval-ask-quality.mts` (paid, deliberate).

## HUMAN-ONLY

1. Apply `supabase/migrations/20260906150000_conversations.sql` (SQL editor),
   then run `npm run verify:conversations` for the full live contract.
2. Google OAuth click-throughs (carried from the auth milestone): add
   `http://localhost:3500/**` to Supabase Auth redirect URLs; sign up via
   Google once as Student, once as Faculty; confirm the roles.
