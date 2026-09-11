-- The knowledge layer: what the lecture MEANT, as opposed to which sentences
-- looked interesting.
--
-- extraction_candidates is sentence-level and carries exactly one evidence
-- span. A real assignment is not one sentence. In the reference lecture it is
-- four, spread over 45 seconds, and the fourth ("vo project ko cloud pe deploy
-- karna hai") is only interpretable given the third. That shape cannot be
-- stored in a one-span row, which is why the product produced two unrelated
-- assignments instead of one.
--
-- These two tables are the smallest thing that fixes it. Candidates are NOT
-- replaced: they remain the immutable Layer-1 record and the baseline any
-- future extraction method is compared against.

create table public.knowledge_items (
  id          uuid primary key default gen_random_uuid(),
  lecture_id  uuid not null references public.lectures(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,

  category    text not null check (category in ('teaching','actionable','reference')),
  kind        text not null,

  title       text not null,
  summary     text not null,
  -- Ordered steps of a multi-part instruction. Empty for a topic or a concept.
  steps       jsonb not null default '[]'::jsonb,
  -- What the lecturer did NOT say. Stored explicitly and positively, because
  -- "no deadline was given" is information a student needs and is exactly what
  -- a summariser silently drops or, worse, invents.
  unspecified jsonb not null default '[]'::jsonb,

  -- Only actionable knowledge is gated. A professor cannot review thirty topics
  -- after every lecture, and a wrong topic costs a student nothing while a
  -- wrong deadline costs them a grade. 'auto' means live without review.
  status      text not null default 'auto'
                check (status in ('auto','pending','confirmed','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,

  confidence  numeric,
  -- Which reasoning pass produced this, so two passes can be compared and a
  -- bad one can be identified and re-run. Same contract as extraction_method.
  reconstruction_method  text not null,
  reconstruction_version text not null,
  -- Verbatim model output for this item, kept so a disputed reconstruction can
  -- be audited without re-running anything.
  model_raw   jsonb,
  created_at  timestamptz not null default now()
);
create index on public.knowledge_items (lecture_id, category);
create index on public.knowledge_items (course_id, status);

-- Many spans per item. This is the whole point of the table.
create table public.knowledge_evidence (
  id                uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references public.knowledge_items(id) on delete cascade,
  lecture_id        uuid not null references public.lectures(id) on delete cascade,
  -- What this span contributes: introduces / requires / step / deadline /
  -- context. Free text rather than a constraint, because the reasoning layer
  -- discovers roles the schema should not have to predict.
  role              text,
  start_ms          integer not null,
  end_ms            integer not null,
  char_start        integer,
  char_end          integer,
  -- VERBATIM transcript text. Every quote is verified to occur in the
  -- transcript before the item is stored; one that does not verify causes the
  -- whole item to be discarded. That is what makes "the model must not invent"
  -- a property of the pipeline rather than a line in a prompt.
  quote             text not null,
  created_at        timestamptz not null default now()
);
create index on public.knowledge_evidence (knowledge_item_id);

alter table public.knowledge_items    enable row level security;
alter table public.knowledge_evidence enable row level security;

grant select, insert, update, delete on public.knowledge_items    to service_role;
grant select, insert, update, delete on public.knowledge_evidence to service_role;
