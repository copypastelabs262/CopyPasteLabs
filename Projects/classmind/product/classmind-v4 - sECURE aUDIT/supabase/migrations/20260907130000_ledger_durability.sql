-- The spend ledger must outlive what it billed for. 2026-09-07, security
-- closure pass.
--
-- THE DEFECT
--
-- `processing_runs` and `ask_runs` are the durable half of the cost controls:
-- src/lib/rate-limit.ts counts rows in them to answer "what has this account
-- actually been billed for in the last hour", and two deployment-wide ceilings
-- count them with no user filter at all. That layer is described in its own
-- header as the one that "cannot be reset by spreading requests across
-- instances -- because it counts spend, not requests".
--
-- It could be reset, by an ordinary product action. Both tables reference the
-- thing they billed for ON DELETE CASCADE:
--
--     processing_runs.lecture_id -> lectures(id) on delete cascade   (20260830160000:33)
--     processing_runs.course_id  -> courses(id)  on delete cascade   (:34)
--     ask_runs.course_id         -> courses(id)  on delete cascade   (20260903100000:25)
--     ask_runs.lecture_id        -> lectures(id) on delete cascade   (:27)
--
-- and `DELETE /api/lectures/{id}` is available to any course owner. So:
-- extract to the hourly limit, delete the lecture, recreate it, repeat. Each
-- delete erased the very rows the quota counted -- including the
-- deployment-wide ceilings, which every other account then also got back.
--
-- A rate limit on deletion landed with this migration as the half that works
-- without a schema change. This is the real fix: a bill is a historical fact
-- about money that was spent, and deleting the lecture does not un-spend it.
--
-- WHAT CHANGES, AND WHY IT IS SAFE
--
-- Nothing is dropped and no row is deleted. The FKs move from CASCADE to SET
-- NULL and the two columns that were NOT NULL become nullable, so a deleted
-- lecture leaves its ledger rows behind with a null pointer instead of taking
-- them with it. Reporting that joins on those columns simply sees nulls, which
-- is the truth: the lecture is gone, the spend happened.
--
-- `processing_runs` additionally gains `owner_id`, because it is the one ledger
-- with no user column -- today the per-user count is reconstructed by fanning
-- out over the caller's owned courses, which is both fragile (a large enough
-- fan-out breaks the query, and a broken query fails OPEN) and useless once
-- course_id can be null. `ask_runs` already carries `user_id` and needs none.
--
-- APPLICATION COMPATIBILITY: src/lib/rate-limit.ts reads owner_id when it is
-- there and falls back to the course fan-out when it is not, so this migration
-- and the code that uses it can land in either order.

-- ---------------------------------------------------------------------------
-- 1. processing_runs
-- ---------------------------------------------------------------------------

alter table public.processing_runs add column if not exists owner_id uuid;

comment on column public.processing_runs.owner_id is
  'Who was billed for this run. Denormalised from courses.owner_id at write time and deliberately NOT a foreign key with a cascade: a spend record must survive the deletion of the course, the lecture and the account it describes.';

-- Backfill from the course that still exists. Rows whose course is already gone
-- cannot be attributed and stay null; they are historical either way.
update public.processing_runs r
   set owner_id = c.owner_id
  from public.courses c
 where r.course_id = c.id
   and r.owner_id is null;

create index if not exists processing_runs_owner_idx
  on public.processing_runs (owner_id, created_at desc);

-- The pointers become nullable and stop cascading.
alter table public.processing_runs alter column lecture_id drop not null;
alter table public.processing_runs alter column course_id  drop not null;

alter table public.processing_runs drop constraint if exists processing_runs_lecture_id_fkey;
alter table public.processing_runs
  add constraint processing_runs_lecture_id_fkey
  foreign key (lecture_id) references public.lectures(id) on delete set null;

alter table public.processing_runs drop constraint if exists processing_runs_course_id_fkey;
alter table public.processing_runs
  add constraint processing_runs_course_id_fkey
  foreign key (course_id) references public.courses(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. ask_runs
-- ---------------------------------------------------------------------------
--
-- user_id is already present and already carries no FK (20260903100000:29-31
-- says so deliberately), so the per-user count survives on its own once the
-- course pointer stops cascading.

alter table public.ask_runs alter column course_id drop not null;

alter table public.ask_runs drop constraint if exists ask_runs_course_id_fkey;
alter table public.ask_runs
  add constraint ask_runs_course_id_fkey
  foreign key (course_id) references public.courses(id) on delete set null;

alter table public.ask_runs drop constraint if exists ask_runs_lecture_id_fkey;
alter table public.ask_runs
  add constraint ask_runs_lecture_id_fkey
  foreign key (lecture_id) references public.lectures(id) on delete set null;

create index if not exists ask_runs_user_idx on public.ask_runs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Prove it
-- ---------------------------------------------------------------------------
--
-- Same reasoning as the post-condition in 20260907120000: a migration whose
-- statements can each succeed while the whole is inert is one somebody
-- re-audits in six months to find out whether it worked.
do $$
declare
  bad text;
begin
  select string_agg(format('%s.%s -> %s', c.conrelid::regclass, a.attname, c.confdeltype), '; ')
    into bad
    from pg_constraint c
    join lateral unnest(c.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.contype = 'f'
     and c.conrelid in ('public.processing_runs'::regclass, 'public.ask_runs'::regclass)
     and a.attname in ('lecture_id', 'course_id')
     and c.confdeltype <> 'n';   -- 'n' = SET NULL

  if bad is not null then
    raise exception
      'ledger_durability: a spend ledger still cascades off what it billed (%). Deleting a lecture would erase the record of money already spent on it.',
      bad;
  end if;
end $$;
