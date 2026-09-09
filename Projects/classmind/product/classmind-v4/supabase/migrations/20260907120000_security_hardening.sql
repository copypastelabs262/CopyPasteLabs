-- Security hardening, 2026-09-07 (autonomous security audit).
--
-- Three changes, none of which alters product behaviour. Each closes a latent
-- hole rather than an exploited one: the application never relied on any of the
-- defaults being removed here, which is exactly why they were able to sit
-- unnoticed. A default nobody uses is a default nobody notices changing --
-- until the one code path that does use it appears.

-- ---------------------------------------------------------------------------
-- 1. profiles.role must have NO default, and certainly not the privileged one
-- ---------------------------------------------------------------------------
--
-- 20260822090000_classmind_v1_core.sql declares:
--
--     role text not null default 'faculty' check (role in ('faculty','student'))
--
-- src/lib/profile-role.ts states that the five code paths which resolved a
-- missing role to 'faculty' were all removed on 2026-09-06, and names "the
-- schema default" as one of the five. The application half of that fix landed;
-- the schema half did not. The default is still 'faculty' in the database
-- today.
--
-- Nothing currently inserts a profiles row without naming the role -- both
-- writers (ensureProfile and POST /api/profile) pass it explicitly, and the
-- audit traced every call site. So this is not an open vulnerability. It is a
-- loaded one: any future insert that omits the column, any manual row created
-- from the Supabase dashboard, any repair script, silently produces a FACULTY
-- account. That is the precise bug the 2026-09-06 work existed to eliminate,
-- left armed in the one layer that fix did not reach.
--
-- Dropping the default makes the omission an error instead of a privilege
-- grant: `role` stays NOT NULL, so an insert that does not name it now fails
-- loudly. Principle 6 -- failures should be loud and local.
alter table public.profiles alter column role drop default;

comment on column public.profiles.role is
  'faculty | student. NO DEFAULT, deliberately: a role exists only where a person explicitly chose one, and an insert that omits it must fail rather than invent the privileged value. See src/lib/profile-role.ts.';

-- ---------------------------------------------------------------------------
-- 2. Revoke EXECUTE from PUBLIC on the reconstruction claim functions
-- ---------------------------------------------------------------------------
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC automatically. The
-- three claim functions in 20260830140000 grant EXECUTE to service_role
-- explicitly, which reads like a restriction but is additive -- PUBLIC still
-- held it. They live in `public`, which is the schema PostgREST exposes, so an
-- `anon` or `authenticated` caller holding only the publishable anon key could
-- reach them at /rest/v1/rpc/claim_reconstruction_job.
--
-- The blast radius was small and should be stated honestly rather than
-- inflated: all three are `language sql` with no SECURITY DEFINER, so they run
-- with the CALLER's privileges. Whether the caller has table privileges is the
-- part that decides the impact, and section 3 below is what actually removes
-- them -- a stock Supabase project grants anon and authenticated ALL on every
-- table in `public` through ALTER DEFAULT PRIVILEGES, and RLS-with-no-policies
-- is what blocks the read, not the absence of a grant. RLS applies to the
-- UPDATE inside these functions too, so no row moves either way. What an
-- attacker gets is confirmation that the function exists and a
-- differently-shaped error -- reconnaissance, not a claim.
--
-- It is still the wrong default. A function reachable by an unauthenticated
-- key is attack surface whether or not today's body happens to be harmless,
-- and the next revision of one of these -- adding SECURITY DEFINER to let it
-- run under a scheduled sweep, say -- would turn a harmless exposure into a
-- job-stealing one with no review step in between. One line each, no behaviour
-- change: the service role keeps its explicit grant.
-- CONDITIONAL, because these functions may not exist.
--
-- 20260830140000_reconstruction_jobs.sql, which creates them, opens with
-- "WRITTEN 2026-08-30. NOT APPLIED." A bare REVOKE against a function that is
-- not there raises 42883 and, because a migration runs in one transaction,
-- takes the whole file down with it -- including section 1 and section 3 below,
-- which have nothing to do with reconstruction. A hardening migration that
-- fails closed on an unrelated precondition hardens nothing.
--
-- (Checked against the live project on 2026-09-07: the tables DO exist there, so
-- those "NOT APPLIED" headers are stale. That is exactly why this is written
-- defensively rather than from the comments -- the file and the database
-- disagreed, and only one of them was going to be right.)
-- REVOKE FROM anon AND authenticated, NOT ONLY FROM public.
--
-- `from public` alone would have been a no-op that reads like a fix. A stock
-- Supabase project installs
--
--     alter default privileges in schema public
--       grant all on functions to postgres, anon, authenticated, service_role;
--
-- alongside the `on tables` line quoted in section 3. Where that is present,
-- anon and authenticated hold their own DIRECT ACL entries on every function in
-- `public`, and revoking the PUBLIC pseudo-role leaves those entirely intact.
-- Section 3 already got this right for tables (`from anon, authenticated`);
-- doing it differently here was the bug.
--
-- search_path is pinned in the same pass. These are `language sql` INVOKER
-- functions today, so an unpinned path is harmless -- but the argument this
-- section makes for revoking EXECUTE ("the next revision, adding SECURITY
-- DEFINER to let it run under a scheduled sweep, would turn a harmless exposure
-- into a job-stealing one with no review step in between") applies to
-- search_path identically, and it costs one line. Every object the bodies touch
-- is already schema-qualified, so an empty path changes nothing today.
do $$
begin
  execute 'revoke execute on function public.claim_reconstruction_job(uuid, integer) from public, anon, authenticated';
  execute 'alter function public.claim_reconstruction_job(uuid, integer) set search_path = ''''';
exception
  when undefined_function then raise notice 'claim_reconstruction_job absent; nothing to revoke';
  when undefined_object   then raise notice 'a grantee role is absent; skipped claim_reconstruction_job';
  when insufficient_privilege then raise notice 'not owner of claim_reconstruction_job; skipped';
end $$;

do $$
begin
  execute 'revoke execute on function public.claim_reconstruction_windows(uuid, integer, integer, integer) from public, anon, authenticated';
  execute 'alter function public.claim_reconstruction_windows(uuid, integer, integer, integer) set search_path = ''''';
exception
  when undefined_function then raise notice 'claim_reconstruction_windows absent; nothing to revoke';
  when undefined_object   then raise notice 'a grantee role is absent; skipped claim_reconstruction_windows';
  when insufficient_privilege then raise notice 'not owner of claim_reconstruction_windows; skipped';
end $$;

do $$
begin
  execute 'revoke execute on function public.retire_exhausted_reconstruction_windows(uuid, integer) from public, anon, authenticated';
  execute 'alter function public.retire_exhausted_reconstruction_windows(uuid, integer) set search_path = ''''';
exception
  when undefined_function then raise notice 'retire_exhausted_reconstruction_windows absent; nothing to revoke';
  when undefined_object   then raise notice 'a grantee role is absent; skipped retire_exhausted_reconstruction_windows';
  when insufficient_privilege then raise notice 'not owner of retire_exhausted_reconstruction_windows; skipped';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Belt and braces on the Supabase default privileges
-- ---------------------------------------------------------------------------
--
-- A stock Supabase project ships with
--
--     alter default privileges in schema public
--       grant all on tables to postgres, anon, authenticated, service_role;
--
-- so a table created in `public` BY THE ROLE THAT CARRIES THAT DEFAULT is
-- GRANTed to anon and authenticated whether or not the migration says so. What
-- actually stops the anon key reading this product's data is therefore
-- RLS-with-zero-policies alone. The audit verified all 16 product tables have
-- row level security enabled (none is missing), so the invariant holds today.
--
-- It holds by a single mechanism, though, and the failure mode is silent: a
-- future table added to `public` without row level security is world-readable
-- through the publishable anon key from the moment it exists, with nothing in
-- the diff that looks wrong. Revoking the blanket grants means such a table
-- would be unreachable rather than open -- the difference between a bug and a
-- breach.
--
-- The qualifier in that first sentence is new, and it is the whole lesson of
-- 2026-09-07. Read (b) below before deleting it.
--
-- ---------------------------------------------------------------------------
-- REWRITTEN 2026-09-09, BECAUSE THE FIRST VERSION WAS REJECTED BY THE DATABASE
-- ---------------------------------------------------------------------------
--
--     ERROR: P0001: security_hardening: default privileges in schema public
--     still grant to anon/authenticated (supabase_admin grants SELECT,UPDATE,
--     USAGE on S; supabase_admin grants DELETE,INSERT,MAINTAIN,REFERENCES,
--     SELECT,TRIGGER,TRUNCATE,UPDATE on r; supabase_admin grants EXECUTE on f)
--
-- A migration is one transaction, so that RAISE also discarded sections 1 and
-- 2 -- the `profiles.role` default drop and the three function revokes -- which
-- had already run and have nothing whatever to do with default privileges.
-- Four things came out of that failure. They are the four changes below.
--
-- (a) `alter default privileges for role X` requires the session to hold X's
--     privileges. On hosted Supabase the session role is `postgres` (SQL
--     Editor, `supabase db push` and the dashboard table editor all connect as
--     it) and `postgres` is deliberately not a member of the `supabase_admin`
--     superuser -- that non-membership is what makes hosted `postgres` a
--     non-superuser at all. `supabase_admin` was ALREADY named in the old role
--     array, the loop ran, and its three entries came back carrying the
--     complete stock GRANT ALL: nothing had been revoked from them. The old
--     handler caught exactly undefined_object and insufficient_privilege, and
--     the role plainly exists (it rendered by name through ::regrole), so it
--     was insufficient_privilege. Adding role names could never have fixed
--     this. The array was never the problem. The privilege is, and it is not
--     ours to have; there is no supported self-service route -- not the
--     dashboard, not the CLI, not the Management API -- that changes it.
--
-- (b) A `pg_default_acl` row is keyed on the role that will OWN the new object,
--     not on the role that installed the row and not on the schema. `defaclrole
--     = supabase_admin` means "objects supabase_admin creates here are granted
--     to anon and authenticated". It says nothing about objects `postgres`
--     creates. So the entry this migration died on governs nothing this product
--     makes -- and, symmetrically, the sentence at the top of this section is
--     only true for tables created by a role that carries such a default. That
--     is a fact about the live catalogue, not about the file, which is why the
--     report at the end of section 4 now prints the BEFORE state rather than
--     asserting it in prose.
--
-- (c) The old post-condition scanned EVERY row of pg_default_acl while section
--     3 could only ever change a subset. An assertion wider than the statements
--     above it is not rigour, it is a hostage: it let a platform default nobody
--     here owns veto a fix to a column default this project does own. The new
--     rule, applied everywhere below:
--
--         ABORT only on what this file actually attempted and the server
--         actually accepted. REPORT, by name, everything else.
--
-- (d) The old file could not see two whole categories. A GLOBAL default ACL
--     (defaclnamespace = 0) is merged into every schema, `public` included, and
--     was invisible to both `in schema public` and to a query filtered on
--     `defaclnamespace = 'public'::regnamespace`. And REVOKE is the one
--     statement here that fails by WARNING rather than by error -- against a
--     grant it is not the grantor of it reports success and changes nothing --
--     yet nothing in the file ever looked at the resulting ACLs, only at the
--     default ones. Both are now surveyed.
--
-- HOW THE FATAL BRANCH IS KEPT SATISFIABLE, since that is the property that
-- failed last time. Section 3 does not predict which roles it may alter -- a
-- prediction is what a hardcoded array is, one rung up. It ATTEMPTS every
-- candidate and RECORDS the outcome of each statement in `_sh_attempt`.
-- Section 4 raises only where the record says "the server accepted this
-- statement" and the catalogue says "the grant is still there". That is a
-- genuine anomaly and nothing else can produce it. It needs no assumption about
-- Supabase's role graph, survives supautils intercepting a statement with an
-- sqlstate nobody anticipated, and cannot drift from what section 3 did,
-- because it IS what section 3 did.
--
-- WHERE THE FINDINGS GO, and why not only into RAISE. Everything this file
-- cannot fix is written into a temp table and RETURNED AS A RESULT SET by the
-- last statement in the migration. NOTICE and WARNING travel on the same
-- protocol message and a client that hides one hides both; the Supabase SQL
-- Editor renders result grids, and whether it surfaces server messages at all
-- is not something this file should bet its only disclosure on. "It scrolled
-- past in a SQL editor" is the exact failure section 4 exists to prevent, so
-- the disclosure is a table you cannot miss, and the warnings are kept as well
-- for anyone applying this through psql.
create temp table if not exists _sh_report (
  seq      serial primary key,
  severity text not null,
  finding  text not null,
  detail   text
);
delete from _sh_report;

create temp table if not exists _sh_attempt (
  rolname name    not null,
  objtype text    not null,
  ok      boolean not null,
  err     text
);
delete from _sh_attempt;

-- THE BEFORE STATE, recorded before anything is changed.
--
-- Nothing in the old file could distinguish "section 3 revoked the blanket
-- grants" from "there was nothing to revoke", and the difference decides
-- whether this section is a control or a no-op. The failed run listed only
-- supabase_admin rows in `public`, which is equally consistent with `postgres`
-- having had a row that the loop cleared and with `postgres` never having had
-- one. This line settles it permanently, in the migration's own output, on the
-- day it runs -- which is the only day anyone will be able to answer it.
do $$
declare
  before_state text;
begin
  select string_agg(format('%s: %s on %s (%s)',
                           d.defaclrole::regrole,
                           a.privs,
                           case d.defaclobjtype
                             when 'r' then 'tables'  when 'S' then 'sequences'
                             when 'f' then 'functions' when 'T' then 'types'
                             when 'n' then 'schemas' else d.defaclobjtype::text
                           end,
                           case when d.defaclnamespace = 0::oid
                                then 'EVERY schema -- global default'
                                else d.defaclnamespace::regnamespace::text
                           end), '; ')
    into before_state
    from pg_default_acl d
    cross join lateral (
      select string_agg(distinct x.privilege_type, ',') as privs
        from aclexplode(d.defaclacl) x
       where x.grantee::regrole::text in ('anon', 'authenticated')
    ) a
   where d.defaclnamespace in (0::oid, 'public'::regnamespace::oid)
     and a.privs is not null;

  insert into _sh_report (severity, finding, detail)
  values ('INFO',
          'default privileges granting to anon/authenticated BEFORE this migration',
          coalesce(before_state,
                   'none. There was nothing for section 3 to revoke: on this database the stock Supabase default either was never installed for a role that creates objects here, or had already been removed. Section 3 is then belt-only, and the live-grant census below is what says whether the product tables ever carried those grants.'));
end $$;

-- The existing grants, removed outright.
--
-- GUARDED, and separately. These were the only two privilege statements in the
-- file without an exception handler: on any database where `anon` or
-- `authenticated` does not exist -- a bare-Postgres CI instance, a local
-- non-Supabase run -- a bare REVOKE raises 42704, and because this file is one
-- transaction that would discard sections 1 and 2 as well. That is exactly the
-- outcome the block above argues against, and it was reintroduced two
-- paragraphs later. They are also split, so a failure on sequences no longer
-- rolls back the tables revoke that had already succeeded.
--
-- What they CANNOT do, which the old file neither said nor checked: REVOKE
-- removes only grants made by the current role or by a role whose privileges it
-- holds. Against any other grantor it emits a WARNING and reports success. So
-- these three statements are not self-verifying, which is why section 4 now
-- reads the present-tense ACLs and not only the default ones.
do $$
begin
  execute 'revoke all on all tables in schema public from anon, authenticated';
exception when undefined_object then
  raise notice 'anon/authenticated absent; no table grants to revoke';
end $$;

do $$
begin
  execute 'revoke all on all sequences in schema public from anon, authenticated';
exception when undefined_object then
  raise notice 'anon/authenticated absent; no sequence grants to revoke';
end $$;

-- ROUTINES, and the word matters: to REVOKE, `all functions` means functions
-- and aggregates and NOT procedures, while `all routines` means all three. (To
-- ALTER DEFAULT PRIVILEGES the two words are synonyms, which is why the loop
-- below still says `functions`.) Section 2 did this by name for the three claim
-- functions that exist today; this catches anything else that has appeared in
-- `public` since, including from the dashboard. It deliberately does not revoke
-- from the PUBLIC pseudo-role on EXISTING routines -- that would reach any
-- extension function living in `public` and break it. Future ones are handled
-- further down, where the blast radius is one schema and one role.
do $$
begin
  execute 'revoke all on all routines in schema public from anon, authenticated';
exception when undefined_object then
  raise notice 'anon/authenticated absent; no routine grants to revoke';
end $$;

-- FUTURE objects. `alter default privileges` is scoped PER OWNING ROLE: with no
-- `for role`, it describes only objects created by the role that runs this
-- migration, which is not necessarily the role Supabase's own defaults were
-- installed under. Getting this wrong produces a statement that succeeds,
-- changes nothing, and reads in the diff exactly like one that worked.
--
-- The role set is a query, not a literal. It is every role that owns a relation
-- or a function in `public` today (that is who a default will actually fire
-- for), plus `current_user` (whoever runs the next migration), plus every role
-- that already holds a default-privilege entry reaching `public` (so section 4
-- can never demand something section 3 did not try). Deriving it fixes the
-- class rather than the instance: a role that starts creating objects here next
-- year is covered without anyone editing an array.
--
-- Four object types, because section 4 asserts over four. Types are included
-- not because a USAGE grant on a type is a data path -- it is not -- but
-- because an assertion that covers an object type the fix does not touch is the
-- same hostage as before, one axis over. Schemas ('n') are the one type left
-- out: a schema default is global by construction, `on schemas` cannot be
-- combined with `in schema`, and section 4 therefore reports it rather than
-- demanding it.
--
-- ONLY the `in schema public` form is issued. A GLOBAL default belongs to no
-- schema and revoking one would change what this role grants in `auth`,
-- `storage` and every schema created later; that is a decision for the
-- operator, not a side effect of a migration whose title says `public`. Global
-- entries are detected, named in the report with the exact statement to run,
-- and never made fatal -- action and assertion stay the same shape.
--
-- Each statement gets its OWN handler and its own row in `_sh_attempt`. The old
-- loop shared one handler across three statements, and a PL/pgSQL block with an
-- EXCEPTION clause is one implicit savepoint, so the first failure discarded the
-- two that would have worked. `when others` rather than a named pair, because
-- hosted Supabase loads supautils, which intercepts statements against reserved
-- platform roles and does not promise to report them as 42501 -- and an
-- sqlstate this file failed to anticipate would abort the whole migration
-- again, over state we do not own. Swallowing broadly is safe here only because
-- the outcome is recorded and re-checked: the statement degrades quietly, the
-- file does not. (OTHERS does not catch query_canceled, so a statement_timeout
-- still propagates, as it should.)
do $$
declare
  rec      record;
  i        int;
  objtypes text[] := array['r', 'S', 'f', 'T'];
  stmts    text[] := array[
    'alter default privileges for role %I in schema public revoke all on tables from anon, authenticated',
    'alter default privileges for role %I in schema public revoke all on sequences from anon, authenticated',
    'alter default privileges for role %I in schema public revoke all on functions from anon, authenticated',
    'alter default privileges for role %I in schema public revoke all on types from anon, authenticated'
  ];
begin
  for rec in
    select ro.rolname
      from pg_roles ro
     where ro.oid in (
             select c.relowner
               from pg_class c
              where c.relnamespace = 'public'::regnamespace
                and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
             union
             select p.proowner
               from pg_proc p
              where p.pronamespace = 'public'::regnamespace
             union
             select d.defaclrole
               from pg_default_acl d
              where d.defaclnamespace in (0::oid, 'public'::regnamespace::oid)
             union
             select r2.oid
               from pg_roles r2
              where r2.rolname = current_user
           )
     order by ro.rolname
  loop
    for i in 1 .. array_length(stmts, 1)
    loop
      begin
        execute format(stmts[i], rec.rolname);
        insert into _sh_attempt (rolname, objtype, ok, err)
        values (rec.rolname, objtypes[i], true, null);
      exception when others then
        insert into _sh_attempt (rolname, objtype, ok, err)
        values (rec.rolname, objtypes[i], false, sqlstate || ' ' || sqlerrm);
      end;
    end loop;
  end loop;
end $$;

-- THE PUBLIC PSEUDO-ROLE ON FUTURE FUNCTIONS -- a deliberate change of default,
-- kept in its own block so it is a choice rather than a line that slid past
-- inside a loop.
--
-- PostgreSQL grants EXECUTE on every new function to PUBLIC through a hardwired
-- built-in default, not through pg_default_acl. anon and authenticated are
-- covered by PUBLIC like every other role, so the `revoke all on functions`
-- line in the loop above removes their DIRECT entry and leaves them reaching a
-- future function through PUBLIC anyway. Without this block, section 3 defends
-- future tables and future sequences and leaves the next `create function` in
-- `public` callable at /rest/v1/rpc/<name> with the publishable key -- the exact
-- exposure section 2 exists to close, returning automatically, with nothing left
-- behind to catch it. Section 2 got this right for the three functions that
-- exist today by naming PUBLIC alongside the two roles; this is that same
-- correction applied to the functions that do not exist yet.
--
-- PAIRED WITH A GRANT, because the honest version of this trade says what it
-- costs. Revoking PUBLIC's EXECUTE would otherwise mean a future function in
-- `public` is not callable by service_role either -- service_role reaches
-- function EXECUTE through PUBLIC like everyone else -- and every server route
-- in this product holds the service-role key. The paired default keeps exactly
-- the access the product actually uses and removes the rest. The residual cost,
-- stated rather than buried: a future function created here by another role
-- still needs its own grant, and if an extension is ever installed into
-- `public` rather than `extensions` its functions fail closed. Delete this
-- block if that trade is unwanted; nothing in section 4 depends on it.
--
-- `for role current_user` and `in schema public` only. This is the one
-- statement in the file that CREATES a default-ACL row rather than emptying
-- one, so its scope is the narrowest that does the job: the role that runs
-- migrations here, in the schema PostgREST exposes.
do $$
begin
  execute format(
    'alter default privileges for role %I in schema public revoke execute on functions from public', current_user);
  execute format(
    'alter default privileges for role %I in schema public grant execute on functions to service_role', current_user);
exception when others then
  insert into _sh_report (severity, finding, detail)
  values ('HAZARD',
          'the PUBLIC-EXECUTE default on future functions in public was NOT changed',
          format('%s %s. A function created in `public` after this migration is therefore EXECUTE-able by PUBLIC, which includes anon: reachable at /rest/v1/rpc with the publishable key. Revoke it by name the way section 2 does, for every function added here.',
                 sqlstate, sqlerrm));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Prove what was done, and name what was not
-- ---------------------------------------------------------------------------
--
-- Everything above degrades quietly on purpose: a missing role, a missing
-- function, a REVOKE with the wrong grantor and a statement this session is not
-- entitled to run all produce a NOTICE and carry on. That is the right
-- behaviour for each statement and the wrong behaviour for the file, because
-- the combination can leave the whole of section 3 inert while every line
-- reports success and the diff looks correct. That reasoning was right in the
-- first version and is kept exactly. Only its SCOPE has changed.
--
-- 4.1 surveys the default privileges again and files each surviving entry as
--     DEFECT (this file ran the statement, the server accepted it, and the
--     grant is still there -- an anomaly, and the only thing that aborts),
--     HAZARD (out of reach, and the owning role DOES create objects in
--     `public`, so the entry is live), or ACCEPTED (out of reach, and the
--     owning role creates nothing here, so the entry governs objects that do
--     not exist). Note that the inertness claim is COMPUTED against pg_class
--     and pg_proc, not asserted in the message text: the day supabase_admin
--     starts owning something in `public` -- an extension installed there is
--     the realistic route -- this line changes from ACCEPTED to HAZARD by
--     itself. A tripwire that hardcodes its own all-clear is not a tripwire.
--
-- 4.2 surveys the live catalogue: direct grants that survived the revokes, RLS
--     coverage, views that could read around it, and functions anon can still
--     execute. None of it aborts, and that is a considered position rather than
--     a softening. This migration does not create tables and does not enable
--     RLS; a post-condition over state the file does not change is precisely
--     how it failed the first time, and aborting over a table this session may
--     not even own would withhold two working fixes without closing anything.
--     A BREACH row is a real exposure and says so in the returned table, in
--     capital letters, on every run.
--
-- What this file therefore no longer claims: that no role anywhere has a
-- default privilege in `public` granting to anon or authenticated. That
-- proposition was never in the threat model -- which is a table WE create later
-- without RLS -- it is not achievable from a project-owner session, and it is
-- not this product's to own.
do $$
begin
  insert into _sh_report (severity, finding, detail)
  select case when o.attempted_ok then 'DEFECT'
              when o.creates_here then 'HAZARD'
              else 'ACCEPTED'
         end,
         format('default privileges for role %s still grant %s on %s (%s)',
                o.rolname, o.privs, o.objword, o.scope_label),
         case
           when o.attempted_ok then
             'Section 3 ran this revoke and the server ACCEPTED it, yet the entry survives. That is the silent-failure mode this file exists to catch, and the control is inert. Diagnose with: select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl from pg_default_acl;'
           when o.creates_here then
             format('NOT fixed. %s This role OWNS objects in `public` today, so the entry is LIVE for anything it creates here: the assumption that platform defaults are inert for this product has EXPIRED. Check row level security on whatever that role owns before treating this as accepted.',
                    coalesce('Section 3 attempted it and the server refused: ' || o.err || '.',
                             'Section 3 did not attempt it at this scope.'))
           else
             format('NOT fixed, and deliberately not fatal. %s This role owns nothing in `public`, and a default ACL fires only for the role that CREATES the object, so it cannot reach anything this product makes. Record it in SECURITY.md as accepted platform state; there is no supported route by which a project owner removes it.%s',
                    coalesce('Section 3 attempted it and the server refused: ' || o.err || '.',
                             'Section 3 did not attempt it at this scope.'),
                    case when o.is_global
                         then format(' GLOBAL entry: it applies to new objects in EVERY schema, `public` included. To remove it deliberately, and only after checking what else depends on it: alter default privileges for role %I revoke all on %s from anon, authenticated;',
                                     o.rolname, o.objword)
                         else '' end)
         end
    from (
      select ro.rolname::text                         as rolname,
             a.privs                                  as privs,
             case d.defaclobjtype
               when 'r' then 'tables'  when 'S' then 'sequences'
               when 'f' then 'functions' when 'T' then 'types'
               when 'n' then 'schemas' else d.defaclobjtype::text
             end                                      as objword,
             (d.defaclnamespace = 0::oid)             as is_global,
             case when d.defaclnamespace = 0::oid
                  then 'EVERY schema -- global default'
                  else 'schema public'
             end                                      as scope_label,
             coalesce(att.ok, false)                  as attempted_ok,
             att.err                                  as err,
             exists (select 1
                       from pg_class c
                      where c.relnamespace = 'public'::regnamespace
                        and c.relowner = d.defaclrole
                      union all
                     select 1
                       from pg_proc p
                      where p.pronamespace = 'public'::regnamespace
                        and p.proowner = d.defaclrole) as creates_here
        from pg_default_acl d
        join pg_roles ro on ro.oid = d.defaclrole
        cross join lateral (
          select string_agg(distinct x.privilege_type, ',') as privs
            from aclexplode(d.defaclacl) x
           where x.grantee::regrole::text in ('anon', 'authenticated')
        ) a
        left join _sh_attempt att
               on att.rolname = ro.rolname
              and att.objtype = d.defaclobjtype::text
              and d.defaclnamespace = 'public'::regnamespace::oid
       where d.defaclnamespace in (0::oid, 'public'::regnamespace::oid)
         and a.privs is not null
    ) o;

  -- The other grantee nobody looks for. A default ACL granting to the PUBLIC
  -- pseudo-role would hand every role the same privilege and matches no filter
  -- keyed on role names -- aclexplode renders that grantee as oid 0, which
  -- ::regrole prints as '-'. Functions are excluded because PUBLIC EXECUTE on a
  -- function is PostgreSQL's own built-in default rather than an anomaly, and
  -- the block above is what deals with it.
  insert into _sh_report (severity, finding, detail)
  select 'HAZARD',
         format('default privileges for role %s grant %s on %s to PUBLIC (%s)',
                d.defaclrole::regrole, a.privs,
                case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences'
                     when 'T' then 'types' when 'n' then 'schemas'
                     else d.defaclobjtype::text end,
                case when d.defaclnamespace = 0::oid then 'EVERY schema -- global default'
                     else d.defaclnamespace::regnamespace::text end),
         'PUBLIC includes anon and authenticated, so this reaches them without naming them and nothing in section 3 removes it. Not expected on a stock Supabase project; if it is here, someone installed it.'
    from pg_default_acl d
    cross join lateral (
      select string_agg(distinct x.privilege_type, ',') as privs
        from aclexplode(d.defaclacl) x
       where x.grantee = 0::oid
    ) a
   where d.defaclnamespace in (0::oid, 'public'::regnamespace::oid)
     and d.defaclobjtype <> 'f'
     and a.privs is not null;
end $$;

-- 4.2 -- THE LIVE CATALOGUE. Nothing anywhere in this tree looks at it.
-- `npm run test:security` proves RLS by regexing the migration FILES, so it
-- passes identically whether or not one migration has ever been applied and it
-- cannot see a table created by hand in the dashboard. `npm run redteam:auth`
-- probes a hardcoded list of sixteen table names and proves that RLS blocks the
-- read -- it cannot distinguish "RLS returned zero rows" from "no grant", which
-- is precisely the distinction section 3 exists to create. So this reads the
-- catalogue directly, every time the migration runs, and writes what it finds
-- into the returned report.
do $$
declare
  n_roles int;
begin
  select count(*) into n_roles from pg_roles where rolname in ('anon', 'authenticated');
  if n_roles <> 2 then
    insert into _sh_report (severity, finding, detail)
    values ('INFO', 'anon and authenticated are not both present',
            'The live-grant census was skipped: it can prove nothing about roles that do not exist. Expected on a bare-Postgres instance; unexpected on Supabase.');
    return;
  end if;

  -- Direct grants that survived the blanket revokes. The GRANTOR is what
  -- decides whether they could have been removed, not the owner, so it is
  -- printed: a REVOKE by anyone else is a warning and a no-op.
  insert into _sh_report (severity, finding, detail)
  select 'HAZARD',
         format('anon/authenticated still hold %s on public.%s',
                string_agg(distinct x.privilege_type, ','), c.relname),
         format('owner %s, granted by %s. REVOKE removes only grants made by the current role or by a role whose privileges it holds; against any other grantor it emits a WARNING and reports success, which is why section 3 cannot prove this on its own. Zero-policy RLS is what stops the rows being read.',
                c.relowner::regrole,
                string_agg(distinct x.grantor::regrole::text, ' + '))
    from pg_class c
    cross join lateral aclexplode(c.relacl) x
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
     and x.grantee::regrole::text in ('anon', 'authenticated')
   group by c.oid, c.relname, c.relowner;

  -- Row level security, which per SECURITY.md is the only thing actually
  -- keeping the publishable key away from product data. Extension-owned
  -- relations are excluded: their RLS is the extension author's business, and
  -- flagging them teaches the reader to ignore this line.
  insert into _sh_report (severity, finding, detail)
  select case when t.reachable then 'BREACH' else 'HAZARD' end,
         format('row level security is DISABLED on public.%s', t.relname),
         case when t.reachable
              then 'AND anon or authenticated hold a privilege on it by some route -- a direct grant, the PUBLIC pseudo-role, or role membership. Those rows are readable with the publishable key right now. Fix the table, not this migration.'
              else 'Nothing anon or authenticated can reach today, so this is the bug-rather-than-breach state section 3 exists to produce. It is still one grant away from being a breach.'
         end
    from (
      select c.relname::text as relname,
             (has_table_privilege('anon', c.oid, 'select,insert,update,delete')
           or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')) as reachable
        from pg_class c
       where c.relnamespace = 'public'::regnamespace
         and c.relkind in ('r', 'p')
         and not c.relrowsecurity
         and not exists (select 1
                           from pg_depend dep
                          where dep.classid = 'pg_class'::regclass
                            and dep.objid = c.oid
                            and dep.deptype = 'e')
    ) t;

  -- Views are the other way around RLS, and relrowsecurity is meaningless for
  -- them. A view without security_invoker reads its base tables as its OWNER,
  -- and the owner here holds BYPASSRLS -- so a reachable non-invoker view in
  -- `public` is a straight bypass of the zero-policy RLS the whole model rests
  -- on. Reported only when anon or authenticated can actually select from it,
  -- which after the revokes above should be never.
  insert into _sh_report (severity, finding, detail)
  select 'BREACH',
         format('public.%s is readable by anon/authenticated and is not security_invoker', c.relname),
         format('relkind %s, owner %s. It reads its base tables with the owner''s privileges, so zero-policy RLS does not stop it. Either revoke the grant or recreate it with (security_invoker = true), as public.lecture_identity_conflicts already is.',
                c.relkind::text, c.relowner::regrole)
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('v', 'm')
     and coalesce(not ('security_invoker=true' = any (c.reloptions)), true)
     and (has_table_privilege('anon', c.oid, 'select')
       or has_table_privilege('authenticated', c.oid, 'select'));

  -- Functions anon can still call. Trigger functions are excluded because
  -- PostgREST cannot invoke them, and extension-owned ones because revoking
  -- there breaks the extension.
  insert into _sh_report (severity, finding, detail)
  select 'HAZARD',
         'anon or authenticated can still EXECUTE functions in public',
         string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' order by p.proname)
           || '. Usually the built-in EXECUTE grant to PUBLIC that CREATE FUNCTION makes; each is reachable at /rest/v1/rpc with the publishable key. Revoke it by name the way section 2 does.'
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prorettype <> 'trigger'::regtype
     and not exists (select 1
                       from pg_depend dep
                      where dep.classid = 'pg_proc'::regclass
                        and dep.objid = p.oid
                        and dep.deptype = 'e')
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
  having count(*) > 0;
end $$;

-- THE ASSERTION. One condition, and it is the narrow one: a statement this file
-- ran, that the server accepted, that did not take effect. Everything else is
-- in the report. If this raises, do not record section 3 as applied.
do $$
declare
  defects text;
  loud    text;
begin
  select string_agg(finding || ' -- ' || coalesce(detail, ''), ' | ' order by seq)
    into defects
    from _sh_report
   where severity = 'DEFECT';

  select string_agg(severity || ': ' || finding, ' | ' order by seq)
    into loud
    from _sh_report
   where severity in ('BREACH', 'HAZARD', 'ACCEPTED');

  if loud is not null then
    raise warning 'security_hardening findings (also returned as the result set of this migration): %', loud;
  end if;

  if defects is not null then
    raise exception 'security_hardening: %', defects;
  end if;

  if loud is null then
    insert into _sh_report (severity, finding, detail)
    values ('OK',
            'nothing left to report',
            'No default privilege reaching `public` grants to anon or authenticated, no live grant to either survives in `public`, every non-extension table there has row level security enabled, and no function there is callable by them. True at the moment this migration ran and never re-proved afterwards -- see the note below.');
  end if;
end $$;

-- The report, returned as rows because a warning may never be displayed. Read
-- it. BREACH means data is reachable with the publishable key now; DEFECT means
-- this file lied to itself (it cannot appear here -- it aborts); HAZARD means
-- something that is one grant or one table away from a breach; ACCEPTED means a
-- platform default this project cannot remove and has reasoned about.
--
-- And the limit of all of it, said plainly: these are one-shot assertions. They
-- are true on the day this migration runs and are never checked again, while
-- the threat the whole section is about is a table someone creates NEXT year.
-- The durable version of 4.2 is a standing, free, read-only check beside
-- scripts/verify-storage-security.mts, wired into `npm run test:security`. Until
-- that exists, this control is believed on the strength of one green run.
select r.severity, r.finding, r.detail
  from _sh_report r
 order by case r.severity
            when 'BREACH'   then 1
            when 'DEFECT'   then 2
            when 'HAZARD'   then 3
            when 'ACCEPTED' then 4
            when 'OK'       then 5
            else 6
          end,
          r.seq;

-- auth.users is Supabase's, not ours, and is not touched here.
--
-- NOTE FOR THE OPERATOR: if a future feature ever wants the browser to talk to
-- PostgREST directly, it needs a deliberate `grant` plus a written RLS policy,
-- and that pair is a Decision entry. Today nothing does -- src/lib/supabase/
-- browser.ts is sign-in only and says so.
