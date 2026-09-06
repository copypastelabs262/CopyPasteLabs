-- PERSISTENT CONVERSATIONS.
--
-- WRITTEN 2026-09-06. NOT APPLIED. Apply deliberately.
-- Until it is applied the code degrades rather than breaks: the ask route
-- answers exactly as before and reports `conversation: "unavailable"`, the UI
-- falls back to the ephemeral in-page conversation, and nothing is lost except
-- persistence itself.
--
-- WHY THIS EXISTS
--
-- Ask became a real conversation surface on 2026-09-06 (history rides each
-- POST), but the conversation lived only in component state: a refresh, a
-- navigation, a closed tab -- gone. The product's direction is a student
-- partner with ongoing academic memory, and the first brick of that is
-- conversations that are REAL: stored, owned, resumable.
--
-- THE SCOPE MODEL (Global Ask foundation)
--
-- A conversation is grounded in an academic context boundary, named by
-- `scope`:
--
--   'lecture'  course_id + lecture_id     the lecture page (today)
--   'course'   course_id only             the course Ask tab (today)
--   'global'   neither                    the future cross-course partner
--
-- The check constraint makes the three shapes the only representable ones.
-- Retrieval stays where it always was -- readKnowledge over the SAME canonical
-- knowledge -- so a wider scope is a wider read, never a second knowledge
-- layer.
--
-- OWNERSHIP
--
-- A conversation belongs to exactly one authenticated user. Same access model
-- as every product table: RLS ON with ZERO policies, so the anon key can read
-- nothing and the service-role server routes are the only path -- and every
-- route filters on owner_id = the session user. A student can never read
-- another student's conversation because no query without their id exists.

create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,

  scope      text not null check (scope in ('lecture','course','global')),
  course_id  uuid references public.courses(id)  on delete cascade,
  lecture_id uuid references public.lectures(id) on delete cascade,

  -- Deterministic, from the first question (see deriveConversationTitle).
  -- Never a model call: a title is a label, not a synthesis.
  title      text not null default 'New conversation',

  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),

  constraint conversations_scope_shape check (
       (scope = 'lecture' and course_id is not null and lecture_id is not null)
    or (scope = 'course'  and course_id is not null and lecture_id is null)
    or (scope = 'global'  and course_id is null     and lecture_id is null)
  )
);

-- The resume read: "my conversations here, newest activity first".
create index conversations_owner_recent_idx
  on public.conversations (owner_id, last_message_at desc);
create index conversations_owner_lecture_idx
  on public.conversations (owner_id, lecture_id, last_message_at desc);
create index conversations_owner_course_idx
  on public.conversations (owner_id, course_id, last_message_at desc);

create table public.conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- Denormalised so ownership filters need no join, exactly like
  -- knowledge_evidence carries lecture_id.
  owner_id        uuid not null references auth.users(id) on delete cascade,

  -- The same two voices AskTurn already speaks in.
  role    text not null check (role in ('student','classmind')),
  content text not null,

  -- Assistant messages only: how the answer was produced and what it cited,
  -- so a resumed conversation renders exactly what the student saw --
  -- route/degraded/unit counts plus the cited sources with their evidence.
  -- The conversation stores the ANSWER's provenance; it never becomes
  -- knowledge itself and is never retrieved from.
  payload jsonb,

  -- Monotonic order. Timestamps tie under load; an identity column cannot.
  seq        bigint generated always as identity,
  created_at timestamptz not null default now()
);

create index conversation_messages_thread_idx
  on public.conversation_messages (conversation_id, seq);

alter table public.conversations         enable row level security;
alter table public.conversation_messages enable row level security;

grant select, insert, update, delete on public.conversations         to service_role;
grant select, insert, update, delete on public.conversation_messages to service_role;

comment on table public.conversations is
  'One student conversation with ClassMind, grounded in an academic scope (lecture/course/global). Owned by exactly one user; served only through owner-filtered service-role routes.';
comment on table public.conversation_messages is
  'Ordered messages of one conversation. Assistant rows carry the answer provenance (route, sources) so resuming renders what was actually shown.';
