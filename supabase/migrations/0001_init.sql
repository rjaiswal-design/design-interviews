-- Interviews — the schema of record.
--
-- Four tables mirroring the four IndexedDB object stores the app runs on today:
-- candidates, rounds, segments, events. `src/lib/db.ts` is the only file that
-- talks to either, so this is the whole surface a backend has to satisfy.
--
-- Ids are text, not uuid, and keep the ids the app already generates
-- (`cand_mu1...`, `round_...`). That is deliberate: it means a board somebody
-- has been using locally can be pushed up as-is, rather than every row being
-- reissued and every foreign key rewritten on the way.
--
-- Columns are snake_case here and camelCase in TypeScript. The mapping lives in
-- `db.ts`, which is the one place that already knows both shapes.
--
-- Apply with:
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
-- or paste into the SQL editor in the dashboard.

begin;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Clear what is there
--
-- Destructive, and scoped to this app's own objects rather than the schema:
-- dropping all of `public` would take Supabase's own extensions and anything
-- else living in this project with it. `cascade` handles the foreign keys and
-- the policies. Order does not matter with cascade, but it reads better
-- children-first.
-- ──────────────────────────────────────────────────────────────────────────────

drop table if exists public.segments cascade;
drop table if exists public.events cascade;
drop table if exists public.rounds cascade;
drop table if exists public.candidates cascade;

drop function if exists public.touch_updated_at() cascade;
drop function if exists public.is_team() cascade;
drop sequence if exists public.candidate_ref_seq;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Who is allowed in
--
-- One predicate, used by every policy, so the answer to "who can see this" is
-- in one place and changing it is one line.
--
-- `split_part(email, '@', 2) = 'noon.com'` rather than `email like '%@noon.com'`:
-- the pattern form is easy to get subtly wrong, and an exact match on the domain
-- part cannot be fooled by a lookalike.
--
-- `stable` and `security definer` so it can be inlined into policies and read
-- the JWT without the caller needing rights on anything.
-- ──────────────────────────────────────────────────────────────────────────────

create function public.is_team() returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(split_part(auth.jwt() ->> 'email', '@', 2) = 'noon.com', false);
$$;

comment on function public.is_team() is
  'True for a signed-in noon.com address. The single gate on every table.';

-- Server-set `updated_at`. The app sends one too, and it is ignored: the
-- database clock is the only one every client agrees on, and a timestamp a
-- client can choose is a timestamp a client can get wrong.
create function public.touch_updated_at() returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Candidates
-- ──────────────────────────────────────────────────────────────────────────────

-- `ref` is the number people say out loud. A sequence, not `max(ref) + 1`:
-- the client-side version races the moment two people add a candidate at once,
-- and two candidates sharing a ref breaks the one identifier humans use.
create sequence public.candidate_ref_seq start 101;

create table public.candidates (
  id                text        primary key,
  ref               bigint      not null unique default nextval('public.candidate_ref_seq'),
  name              text        not null default '',

  -- Which ladder they walk. Decides their rounds and who runs them.
  track             text        not null default 'product'
                                check (track in ('product', 'visual')),

  -- Where they are in the funnel. `pending` means nobody has decided to
  -- interview them yet, and a pending candidate has no rounds at all.
  status            text        not null default 'pending'
                                check (status in (
                                  'pending', 'shortlisted', 'offer_out',
                                  'hired', 'offer_dropped', 'rejected'
                                )),

  -- The opening they are up for. Free text, not an enum: the alternative is a
  -- list of openings this app has to be told about before anyone can be added.
  role              text        not null default '',
  level             text        not null default '',
  location          text        not null default '',
  portfolio         text        not null default '',
  email             text        not null default '',
  phone             text        not null default '',

  -- Where they are now, and their own title there — which is not `role`.
  previous_company  text        not null default '',
  previous_position text        not null default '',

  source            text        not null default '',
  notes             text        not null default '',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter sequence public.candidate_ref_seq owned by public.candidates.ref;

create index candidates_status_idx on public.candidates (status);
create index candidates_track_idx  on public.candidates (track);

create trigger candidates_touch
  before update on public.candidates
  for each row execute function public.touch_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Rounds
-- ──────────────────────────────────────────────────────────────────────────────

create table public.rounds (
  id            text        primary key,
  candidate_id  text        not null references public.candidates (id) on delete cascade,

  -- Which rung. Deliberately *not* a check constraint.
  --
  -- The set of rungs is `src/lib/ladder.ts`, it changes when the process
  -- changes, and rounds run on rungs the process has since dropped are kept on
  -- purpose — they are the record of conversations that happened. A check here
  -- would mean a migration every time a round is added or retired, and would
  -- make the app unable to read its own history.
  kind          text        not null,

  -- Names, not ids. There is no people table, and inventing one would be a
  -- second source of truth for something the calendar already knows.
  interviewers  text[]      not null default '{}',

  -- Null means unscheduled, which is a real state on an active funnel. The app
  -- carries 0 for this; `db.ts` maps the two.
  scheduled_at  timestamptz,
  duration_min  integer     not null default 45 check (duration_min > 0),

  status        text        not null default 'scheduled'
                            check (status in ('scheduled', 'in_progress', 'complete', 'cancelled')),

  -- Four points and no midpoint: a scale with a middle collects middles.
  -- `pending` is the absence of an answer, not a neutral one.
  decision      text        not null default 'pending'
                            check (decision in ('pending', 'strong_no', 'no', 'yes', 'strong_yes')),

  -- signal -> 1..4. jsonb because which signals a round scores is decided by
  -- its rung in application code, and columns would have to be migrated every
  -- time a rung's signals changed.
  scores        jsonb       not null default '{}'::jsonb,

  notes         text        not null default '',

  -- Where the conversation happens, and where it can be watched afterwards.
  -- Links, not files: Zoom already hosts both behind its own access control.
  zoom_url      text        not null default '',
  recording_url text        not null default '',

  -- Cached count of this round's transcript lines, so a board paint is not a
  -- transcript read. The segments are the truth; this is a cache of them.
  line_count    integer     not null default 0 check (line_count >= 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One round per rung per candidate. This is what makes a ladder drawable as a
  -- track rather than a list of whatever happened to get booked.
  unique (candidate_id, kind)
);

-- Postgres does not index foreign keys for you, and every read here is
-- "this candidate's rounds".
create index rounds_candidate_idx on public.rounds (candidate_id);
create index rounds_status_idx    on public.rounds (status);

create trigger rounds_touch
  before update on public.rounds
  for each row execute function public.touch_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Segments — the transcript
--
-- The most sensitive thing in this database: what a candidate actually said.
-- Same gate as everything else, and worth knowing it is here when anyone is
-- deciding who gets a login.
-- ──────────────────────────────────────────────────────────────────────────────

create table public.segments (
  id           text        primary key,
  round_id     text        not null references public.rounds (id) on delete cascade,

  -- Milliseconds into the meeting where the export carried a timestamp, 0 where
  -- it did not. A citation and an ordering, not a seek position: there is no
  -- audio here to seek.
  t            integer     not null default 0 check (t >= 0),

  speaker      text        not null default 'unknown'
                           check (speaker in ('interviewer', 'candidate', 'unknown')),
  -- The name as the transcript spelled it, when it is neither known side.
  speaker_name text        not null default '',

  body         text        not null,
  starred      boolean     not null default false,

  -- True for a line typed in rather than pasted from the meeting. The
  -- provenance matters: "we wrote this down" and "the meeting recorded this"
  -- are different claims about the same sentence.
  manual       boolean     not null default false,

  created_at   timestamptz not null default now()
);

-- Only ever read a round at a time. The whole table is every word anyone has
-- said in an interview, and nothing wants all of it at once.
create index segments_round_idx on public.segments (round_id, t);

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Events — the activity log
--
-- Append-only, enforced rather than assumed: there is an insert policy and a
-- select policy and deliberately no update or delete. A log that can be edited
-- is not a log, and the whole value of "Soumya called it yes, three weeks ago"
-- is that nobody can quietly make it say otherwise.
--
-- Lines go when their candidate does, via the cascade. An event whose candidate
-- has been deleted is a sentence about nobody.
-- ──────────────────────────────────────────────────────────────────────────────

create table public.events (
  id           text        primary key,
  candidate_id text        not null references public.candidates (id) on delete cascade,

  -- Null when the event is about the candidate rather than one round. The app
  -- carries '' for this; `db.ts` maps the two.
  round_id     text        references public.rounds (id) on delete cascade,

  -- When it happened, and always in the past: an event records an act, and
  -- booking next week's round is an act performed today. The board sorts on
  -- this, and one future timestamp puts an unstarted round above every
  -- interview that has actually taken place.
  t            timestamptz not null default now(),

  -- Who did it, as a name and as an address. The name is what the line reads
  -- as; the address is the part that stays attributable, because names collide
  -- and change. Once auth is wired these stop being self-declared.
  actor        text        not null default '',
  actor_email  text        not null default '',

  -- The sentence. Written at the moment of the change, because it describes a
  -- before-and-after that is gone by the time anything reads it.
  what         text        not null,

  created_at   timestamptz not null default now()
);

create index events_candidate_idx on public.events (candidate_id, t desc);
create index events_round_idx     on public.events (round_id);
create index events_t_idx         on public.events (t desc);

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Row-level security
--
-- On for every table, with no permissive fallback. The anon key ships inside a
-- JavaScript bundle on a public URL — it is an identifier, not a secret — so
-- these policies are the only thing between that URL and every candidate's
-- phone number and every interview transcript.
--
-- Until Supabase Auth is wired, `is_team()` is false for everybody and these
-- tables read as empty. That is the correct failure direction.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.candidates enable row level security;
alter table public.rounds     enable row level security;
alter table public.segments   enable row level security;
alter table public.events     enable row level security;

-- Candidates, rounds, segments: the team can do anything.
create policy candidates_team on public.candidates
  for all to authenticated using (public.is_team()) with check (public.is_team());

create policy rounds_team on public.rounds
  for all to authenticated using (public.is_team()) with check (public.is_team());

create policy segments_team on public.segments
  for all to authenticated using (public.is_team()) with check (public.is_team());

-- Events: read and append only. No update policy and no delete policy, which
-- in RLS means neither is possible — a missing policy denies.
create policy events_read on public.events
  for select to authenticated using (public.is_team());

create policy events_append on public.events
  for insert to authenticated with check (public.is_team());

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. Realtime
--
-- The point of a backend here is that the log is shared. Without this, two
-- people on the board do not see each other's changes until one of them
-- reloads, which is most of the way back to the per-browser version.
--
-- Segments are left out on purpose: a transcript arrives as one paste of a few
-- hundred rows, and broadcasting each of them is a burst of traffic to tell
-- everyone something one refetch of `line_count` already said.
-- ──────────────────────────────────────────────────────────────────────────────

-- Guarded, because this is the last step and the whole file is one transaction:
-- if `supabase_realtime` is not there, a bare `alter publication` aborts the
-- commit and you get none of the schema above for the sake of a nicety.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.candidates;
    alter publication supabase_realtime add table public.rounds;
    alter publication supabase_realtime add table public.events;
  else
    raise notice 'No supabase_realtime publication; skipping realtime. Schema is fine.';
  end if;
end
$$;

commit;

-- ──────────────────────────────────────────────────────────────────────────────
-- Check it landed. Expect 4 tables, all with rls enabled, and 6 policies.
-- ──────────────────────────────────────────────────────────────────────────────

select c.relname as table, c.relrowsecurity as rls, count(p.polname) as policies
from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('candidates', 'rounds', 'segments', 'events')
group by c.relname, c.relrowsecurity
order by c.relname;
