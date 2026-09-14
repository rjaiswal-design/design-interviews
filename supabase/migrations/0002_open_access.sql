-- Open access, because auth is deliberately not being wired yet.
--
-- 0001 gated every policy on `is_team()` — a signed-in noon.com address. With
-- no auth in the app that predicate is false for everybody, so the tables
-- accept no writes at all: an anon insert comes back
-- `42501 new row violates row-level security policy`.
--
-- This swaps those five policies for permissive ones. Be clear about what it
-- means, because "anon" undersells it: the anon key ships inside a JavaScript
-- bundle served from a public URL, so it is an identifier and not a secret.
-- Anyone who finds the deployed site can read and write every row in these
-- tables — candidate names, phone numbers, email addresses and complete
-- interview transcripts — from outside noon and without signing in.
--
-- RLS stays *enabled*, with policies that literally read `using (true)`, rather
-- than being switched off. Two reasons: closing it later is a swap of these
-- policies and nothing else, and a table with RLS disabled is far easier to
-- leave that way by accident than one whose policy says out loud that it is
-- open.
--
-- `is_team()` is left in place, unused, so turning this around is the reverse of
-- this file and nothing more.

begin;

drop policy if exists candidates_team on public.candidates;
drop policy if exists rounds_team     on public.rounds;
drop policy if exists segments_team   on public.segments;
drop policy if exists events_read     on public.events;
drop policy if exists events_append   on public.events;

create policy candidates_open on public.candidates
  for all to anon, authenticated using (true) with check (true);

create policy rounds_open on public.rounds
  for all to anon, authenticated using (true) with check (true);

create policy segments_open on public.segments
  for all to anon, authenticated using (true) with check (true);

-- Events stay read-and-append even while everything else is open. This one was
-- never about who you are: a log that can be edited is not a log, and the value
-- of "Soumya called it yes, three weeks ago" is that nobody can quietly make it
-- say otherwise. No update policy and no delete policy, which in RLS means
-- neither is possible. Lines still go when their candidate does, via the
-- cascade in 0001.
create policy events_read on public.events
  for select to anon, authenticated using (true);

create policy events_append on public.events
  for insert to anon, authenticated with check (true);

commit;

-- Expect: candidates_open, events_append, events_read, rounds_open, segments_open
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('candidates', 'rounds', 'segments', 'events')
order by tablename, policyname;
