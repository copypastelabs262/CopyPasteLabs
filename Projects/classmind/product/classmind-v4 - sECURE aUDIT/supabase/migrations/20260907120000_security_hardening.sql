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
-- so every table created in `public` is GRANTed to anon and authenticated
-- whether or not the migration says so. What actually stops the anon key
-- reading this product's data is therefore RLS-with-zero-policies alone -- the
-- grants are already there. The audit verified all 16 product tables have
-- `enable row level security` (none is missing), so the invariant holds today.
--
-- It holds by a single mechanism, though, and the failure mode is silent: a
-- future `create table public.something` without an accompanying `enable row
-- level security` is world-readable through the publishable anon key from the
-- moment it exists, with nothing in the diff that looks wrong. Revoking the
-- blanket grants means such a table would be unreachable rather than open --
-- the difference between a bug and a breach.
--
-- Scoped to the two roles that must never touch product data directly. The
-- service role, which every server route uses, is untouched.
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

-- FUTURE tables. `alter default privileges` is scoped PER GRANTING ROLE: with no
-- `for role`, it only describes objects created by the role that runs this
-- migration, which is not the role Supabase's own defaults were installed under.
-- Getting this wrong produces a statement that succeeds, changes nothing, and
-- reads in the diff exactly like one that worked.
--
-- So it is repeated for each role that plausibly creates tables here, and each
-- is wrapped: `for role X` fails outright if X does not exist in this project,
-- and the set of built-in roles differs between a hosted Supabase project and a
-- local `supabase start`.
do $$
declare
  r text;
begin
  foreach r in array array['postgres', 'supabase_admin', 'supabase_auth_admin', current_user]
  loop
    begin
      execute format(
        'alter default privileges for role %I in schema public revoke all on tables from anon, authenticated', r);
      execute format(
        'alter default privileges for role %I in schema public revoke all on sequences from anon, authenticated', r);
      -- FUNCTIONS TOO. Without this line the loop defends future tables and
      -- future sequences and leaves future FUNCTIONS granted to everyone --
      -- which is the exact exposure section 2 exists to close, returning
      -- automatically on the next `create function` in `public`, with nothing
      -- left behind to catch it.
      execute format(
        'alter default privileges for role %I in schema public revoke all on functions from anon, authenticated', r);
    exception
      when undefined_object or insufficient_privilege then
        raise notice 'default privileges not adjusted for role %: % ', r, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Prove it worked
-- ---------------------------------------------------------------------------
--
-- Everything above degrades quietly on purpose: a missing role, a missing
-- function and a role this file did not think to name all produce a NOTICE and
-- carry on. That is the right behaviour for each statement and the wrong
-- behaviour for the file, because the combination can leave the whole of
-- section 3 inert while every line reports success and the diff looks correct.
--
-- So the file ends by checking its own work. If any default-privilege entry in
-- `public` still hands anything to anon or authenticated, this raises and the
-- whole migration rolls back -- which is the loud, cheap, reversible failure,
-- and far better than believing a control is in place because a NOTICE scrolled
-- past in a SQL editor.
do $$
declare
  offending text;
begin
  select string_agg(format('%s grants %s on %s', d.defaclrole::regrole, a.privs, d.defaclobjtype), '; ')
    into offending
    from pg_default_acl d
    cross join lateral (
      select string_agg(distinct x.privilege_type, ',') as privs
        from aclexplode(d.defaclacl) x
       where x.grantee::regrole::text in ('anon', 'authenticated')
    ) a
   where d.defaclnamespace = 'public'::regnamespace
     and a.privs is not null;

  if offending is not null then
    raise exception
      'security_hardening: default privileges in schema public still grant to anon/authenticated (%). The role list in section 3 does not cover whoever installed them; run: select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl where defaclnamespace = ''public''::regnamespace;',
      offending;
  end if;
end $$;

-- auth.users is Supabase's, not ours, and is not touched here.
--
-- NOTE FOR THE OPERATOR: if a future feature ever wants the browser to talk to
-- PostgREST directly, it needs a deliberate `grant` plus a written RLS policy,
-- and that pair is a Decision entry. Today nothing does -- src/lib/supabase/
-- browser.ts is sign-in only and says so.
