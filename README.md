# Interviews

The record of every design interview we run. One row per conversation, with the
conversation *on* the row rather than described in it: who, which rung, when, the
call, and the recording — reachable in one click.

It exists because the thing that decides a hire is what somebody said in a room,
and what survives that room is a scorecard filled in twenty minutes later from
memory. This keeps the meeting link, the script, the scorecard and the
transcript on the round, next to the call they produced.

## The two ladders

Product and visual designers are interviewed differently, by different people,
against different things — so they are two processes, not one with optional
rungs. A candidate's `track` decides which they walk, and everyone on a track
walks all of it.

**Product design** — 7 rounds, 5h 30m of a candidate's time

| # | Round | Who runs it | Judges |
|---|-------|-------------|--------|
| 1 | HR round | HR executive | Communication, Ambition |
| 2 | Portfolio | Ayaneshu | Craft, Product thinking, Communication |
| 3 | Design critique & whiteboarding | Rahul | Craft, Systems, Communication |
| 4 | AI coding | Arnab | Craft, Systems, Product thinking |
| 5 | Culture fit | Ayush | Ambition, Collaboration |
| 6 | Product thinking | Saumya | Product thinking, Collaboration, Communication |
| 7 | Offer rollout | Aanchal & Rahul | — |

**Visual design** — 7 rounds, 5h 45m

| # | Round | Who runs it | Judges |
|---|-------|-------------|--------|
| 1 | HR round | HR executive | Communication, Ambition |
| 2 | Portfolio | Sanket / Jithin | Craft, Communication |
| 3 | Motion ⇄ Visual | Saswata | Craft, Systems |
| 4 | Working session | Tamanna | Craft, Collaboration, Communication |
| 5 | Product round | Rahul | Product thinking, Systems, Communication |
| 6 | Culture fit | Ayush | Ambition, Collaboration |
| 7 | Offer rollout | Aanchal & Rahul | — |

The **HR round** comes first so scope, level, market and money are said out loud
before anyone spends an hour on a portfolio. Its owner is **HR executive** — a
role rather than a person, since whoever holds it runs the screen. That is what
an owner is for: a sensible default for the panel, not a claim about who is in
the room, and the actual name goes on the round when it is booked.

`owners` distinguishes a pair from a choice, and `TRung.either` is the flag.
"Aanchal & Rahul" both sit in the offer rollout; "Sanket / Jithin" means either
of them takes the portfolio. It is not decoration — it decides what a new round is
pre-assigned to. Booking two people into a round only one of them will run is a
panel somebody has to correct; leaving one name off a round two people attend is
a panel that is simply wrong.

**Motion ⇄ Visual** is about the file rather than the picture: whether an
illustration is layered so it can move, or is one flat thing that has to be
redrawn to animate. Its signals are craft and systems, not communication — how
a file is constructed and whether the next person can pick it up is the same
question the design system asks of a component.

**Offer rollout** has no signals, and that is deliberate. It is not an
assessment: the decision is already made, and the outcome is the candidate's
status — offer rollout, then hired or offer dropped — not a mark out of four. A
round with no signals shows its purpose where the scorecard would be, rather
than promising a scorecard and rendering one empty row.

`owners` is a default, not a rule: new rounds are pre-assigned to whoever runs
them, because "Portfolio with Ayaneshu" is how the process is described out loud
and an unassigned round is one nobody is going to book. The panel on any round
stays editable.

`signals` is what a round is *qualified* to judge, and it is load-bearing.
Scoring craft in the culture round is the failure mode it prevents: every
interviewer scoring every signal produces six averages and no information,
because most were guesses from people who never saw the work.

Round kinds are prefixed by track and globally unique (`pd_portfolio`,
`vd_portfolio`) even where two tracks have a round of the same name. A portfolio
review with Ayaneshu and one with Sanket are different conversations judged
against different things — distinct ids keep a stored round readable without
having to look up its candidate, and the moment the two scripts diverge, shared
ids would have had to be split anyway.

[`src/lib/ladder.ts`](src/lib/ladder.ts) is the process. Editing that file is
how the process changes, and every shortlisted candidate is reconciled against
their track's ladder on load (see **Retiring a round** below).

## The Pipeline tab

The two processes, drawn as the sequences they are: vertical and numbered on a
rail, each step showing the round, its owner, how long it takes and what it is
allowed to judge. A hiring loop is an order, and the shape and order is the one
thing a reader should take from this screen.

It carried live counts and the full scripts and both were the wrong things
here. Counts belong on the boards, where you can act on the row they describe;
a script is forty lines of prompt that buried the shape, and it lives where it
is used — on the round itself. What is left is the process, plus how much of a
candidate's day each track costs, which is worth knowing before adding a sixth
round.

Nothing there is editable, deliberately: a pipeline you can edit in place is
one that stops matching the rounds anybody already ran.

Rounds run on rungs no ladder has any more get their own section at the foot, so
a retired round is never silently invisible on the one screen that claims to
show the whole process.

**Live:** https://design-interviews.vercel.app ·
**Repo:** https://github.com/rjaiswal-design/design-interviews (private)

Pushes to `main` deploy automatically. `vercel.json` marks `/assets/*`
immutable for a year — Vite fingerprints those filenames, so a given URL's
bytes never change and a new build is a new name. `index.html` keeps Vercel's
`must-revalidate` default, which is what picks up a new build.

## Running it

```bash
npm install
npm run dev     # http://localhost:5240
```

## Who you are

On first run the app asks for a name and an email before anything else, on any
route — a deep link straight to a round is a normal first visit, and an edit
made from it would go into the log attributed to nobody.

The name is what a log line reads as. The **email is the part that stays
attributable**: names collide and change, and the address is the stable key that
maps onto a real account once there is auth behind this. Recording it now means
the log written today still means something then.

Nothing verifies either, and the dialog says so. It is stored in
`localStorage`, never sent anywhere, and [`src/lib/me.ts`](src/lib/me.ts) is the
one module real identity replaces.

## Where things are

| Path | What it is |
|------|------------|
| `src/lib/ladder.ts` | The rungs, their scripts, and what each one is allowed to judge |
| `src/lib/db.ts` | **The storage seam.** Chooses the backend, and nothing else |
| `src/lib/dbSupabase.ts` | The Supabase backend, and the only row mapping |
| `src/lib/dbLocal.ts` | The IndexedDB backend, used when no project is configured |
| `src/lib/store.ts` | Zustand store; every write goes through `db` |
| `src/lib/transcript.ts` | Parsing a transcript pasted from Zoom, Meet or Teams |
| `src/lib/events.ts` | The sentences the activity log is made of |
| `src/lib/importer.ts` | CSV → candidates + generated ladders |
| `src/components/ActivityLog.tsx` | The trail |
| `src/components/RoundPage.tsx` | One round: link, script, scorecard, write-up, transcript, log |
| `src/components/PasteTranscript.tsx` | The paste, its parse preview, and who-is-the-candidate |
| `src/components/TranscriptReader.tsx` | The transcript on its own, searchable |
| `src/components/Board.tsx` | The sheet, by round and by candidate |
| `src/components/PipelineView.tsx` | The process, with the funnel on it |
| `src/components/LadderTrack.tsx` | The ladder, full size and at row height |
| `src/index.css` | Both token systems — see below |

## The funnel

Six states, and one of them changes what exists:

| State | Means |
|-------|-------|
| Yet to be shortlisted | Added or imported. **No rounds yet.** |
| Shortlisted | In the process. Shortlisting creates their track's rounds. |
| Offer rollout | Offer is out |
| Hired | Accepted |
| Offer dropped | Offer lost — they declined, or it was pulled |
| Rejected | Not going ahead |

**Rounds do not exist until somebody is shortlisted.** That is what keeps the
rounds board a list of conversations someone actually intends to have: import a
hundred CVs and you get a hundred candidates and zero rounds, shortlist eight
and their rounds appear. The transition is one-way — leaving the process
never removes rounds, because by then they are the record of why someone left.

`inProcess()` in [`src/lib/candidateStatus.ts`](src/lib/candidateStatus.ts) is
the predicate, and that file is the single home for the states, their labels
and their log sentences. The labels were declared twice, in `Board.tsx` and
`CandidatePanel.tsx` — two copies of one enum's vocabulary.

Legacy statuses (`active`, `offer`, `passed`, `withdrawn`) map forward in
`hydrateCandidate`: a pill with no matching class renders unstyled with a label
of `undefined`, and the old value is still a decision somebody made.

## The board

**One row per candidate being interviewed**, showing where they have got to:
**ref, candidate, applying for, round, ladder, latest**.

It was one row per round, which put a freshly shortlisted candidate on the
board four or five times over — same name, same role, same everything but the
round. That reads as duplication however correct it is, and the question this
board answers is "where is everyone", not "list every conversation we have ever
planned".

**Round** is where they are now: the round in progress if there is one,
otherwise the next one owed, with its status under it. Cancelled rounds are
stepped over — a cancelled portfolio does not leave somebody stuck at portfolio
for ever. A finished ladder reads **All rounds done · Waiting on a decision**,
which is a different state from being at the last round and the one place this
board asks somebody to act. `whereNow()` in `Board.tsx` is the whole rule.

That is also why the round cell carries a status when the Status *column* was
removed as redundant: with one row each, this column answers the question on its
own.

**Ladder** is their whole track at row height with the current round drawn
thicker, and each segment opens its round — so the summary never costs you
access to the rest. **Latest** is the newest log line for that person.

Only candidates in the process appear. Somebody nobody has shortlisted has no
rounds and nothing to be at; they belong on the Candidates tab, which is where
shortlisting happens.

Filters: **Track** and **Round**/**Status** match where they are *now*, which is
what the column shows. **Panel** matches anywhere on their ladder — scoped to
the current round it would hide a candidate whose portfolio you ran and who has
since moved on, which is exactly who you want to find.

Export is still one row per *round*. The board summarises; an export is the data
behind it, and a spreadsheet with five rounds collapsed into "currently at
portfolio" cannot answer anything you would open a spreadsheet for.

## The activity log

The board's right-hand column is one line of log per round, not a row of state
pills. A status and a call say what a round *is*; a line of log says what
someone did and when, which is the question being asked when anyone scans the
sheet. The state is still edited where it is decided — in the room and in the
panel — and the full trail per candidate is at the foot of the panel.

Every line is **derived from the difference between the stored row and the
patch**, in [`src/lib/events.ts`](src/lib/events.ts), and written by the store
rather than by callers. That is the whole design: a new edit surface — a cell, a
dialog, a keyboard shortcut, the room — records itself for free and cannot
forget to log.

**Free text is deliberately not logged.** Notes and write-ups change on nearly
every keystroke-and-blur, and logging them would produce a diary in which the
handful of moments that matter are buried under two hundred "edited the
write-up" lines. That the text changed is visible in the text.

**An event's `t` is always in the past.** It records an act, and booking next
week's round is an act performed today. Nothing may stamp an event from the date
of the thing it is about: the board sorts on `t`, and one future timestamp puts
an unstarted round above every interview that has actually taken place. The seed
did exactly that and it was visible the moment the date column came out.

Lines name the person who did it, which is most of the value — "called it: yes"
is a fact, "Soumya called it: yes, three weeks ago" is what somebody actually
needs. There is no authproxy in front of this, so the name comes from the field
in the top bar ([`src/lib/me.ts`](src/lib/me.ts)) and is kept in
`localStorage`. That is the seam real identity arrives through; until then it is
an honest convenience rather than a claim.

## Retiring a round

The ladder is a list in source, not rows in the database, so changing it leaves
every stored candidate out of step. `load()` reconciles them: rounds for a newly
added rung appear, and empty rounds for a dropped rung go.

**Renaming is not retiring.** When the single four-rung ladder became the
product-design track, its kinds were *renamed* forward (`portfolio` →
`pd_portfolio`) in `hydrateRound`, not retired — they are the same conversations
under the same names. Retiring them would have littered every existing
candidate with four unreadable rounds *and* five new empty ones. `intro`,
`craft`, `systems` and `bar` stay genuinely retired, because no current rung
means what they meant.

**A round that actually happened is never deleted.** If it has a call, a
write-up, a transcript or a recording, it is kept, marked `retired`, and shown
with its real name — it is just not part of anybody's ladder any more and
nothing new is scheduled on it. Retiring a rung means adding it to
`TRetiredKind` in [`src/types.ts`](src/types.ts) with a label in
`ladder.ts`; without that, `rung()` falls through and a completed intro round
renders as "1. Portfolio" — two rows claiming to be the same conversation, one
of which never happened.

## Things worth knowing before changing it

**The meeting is Zoom's job.** This used to record the call and transcribe it
live in the browser. It does not any more, and the version that did is worth
describing so nobody rebuilds it: a `MediaRecorder`, a `SpeechRecognition` that
had to be restarted every time the room went quiet (Chrome fires `onend` on
silence, which in an interview is every time the interviewer stops talking to
listen), a clock that had to discount paused time so line timestamps still
matched the audio, a speaker toggle because the browser recogniser cannot tell
voices apart, and an IndexedDB store full of multi-megabyte blobs.

All of that was replaced by a link out and a paste box. Zoom, Meet and Teams
produce a transcript from the meeting's own audio, with real diarisation, no
microphone permission and nothing to store. It is better on every axis that
matters, and it deleted about four hundred lines.

**A `TSegment.t` is a citation, not a seek position.** It is milliseconds into
the meeting when the export carries timestamps and `0` when it does not. There
is no audio behind it. Lines with no timestamp render as `·` rather than
`0:00`, because claiming a line was said at the top of the call is worse than
admitting the export did not say.

**`.wrap` is the gutter; things that bleed nest inside it.** `.pagehead` and
`.sheet` both carry a negative inline margin so they can extend past the
content — the character field to the window edge, the row hover band 12px into
the gutter — and their own padding puts the content back on the gutter. That
only works with a parent whose padding there is to cancel. Both were once
`className="wrap pagehead"` on a single element, where the margin had nothing
to cancel and dragged the title and the table's first column left of everything
else on the page.

**Rows are normalised where they come off disk**, in `hydrateRound` and
`hydrateSegment` in `db.ts`. Fields added later are simply absent on older
rows, and defaulting in one place is the difference between one function and a
`?? ''` at every call site that ever touches a new field. `zoomUrl` proved it:
`round.zoomUrl.trim()` throws on every round written before meeting links
existed.

**`db.ts` is the only file that knows where data lives.** Wiring this to
Supabase or to a FastAPI backend means reimplementing eight functions, not
auditing the app for writes. The store already treats every call as async and
already refetches after a write, so a network round-trip changes no caller.

**Two token systems, on purpose.** `--prism-*` is the chrome — the app bar,
cards, the side panel, menus: one divider colour, two radii, black as the only
emphasis accent. `--color-*` is the board — 14px body, 999px pills, the
five-step two-layer shadow scale. The names match
`mp-inspect-team/frontend/app-team/src/index.css` so the two stay diffable.
Interleaved property by property there would be no telling which system a value
belongs to, and no way to retune either one.

**Blue means "you chose this" and nothing else.** No status borrows it — a yes
is green because it passed, not because it is selected.

## Populating it from the database

`Import` takes a CSV. One row per candidate; all four rounds are generated for
each. Column names are matched loosely, so `name`, `Candidate Name` and
`candidate_name` all land in the same place, and these spellings are all
understood:

| Field | Also accepted as |
|-------|------------------|
| name | candidate, candidate name, full name |
| role | req, requisition, opening, vacancy, applied for, position |
| level | band, seniority, grade |
| location | city, market, base |
| email | mail, email address |
| portfolio | website, site, url, link |
| source | channel, via, referrer, referral |
| status | stage, state |
| ref | id, candidate id, application id |
| track | discipline, ladder, pipeline, team, craft |
| phone | mobile, tel, telephone, contact number |
| company | current employer, employer, organisation, org |
| their title | job title, title, current role, designation |
| scheduled_at | date, first round, interview date, when |
| interviewer | interviewers, panel, owner, assigned to |

A column nothing maps to is reported rather than dropped silently, and an
unparseable date leaves the round unscheduled rather than landing it on an
invented day. Imports add; nothing already on the board is touched.

## The backend

Two implementations behind one shape, chosen at module load in
[`src/lib/db.ts`](src/lib/db.ts):

- **Supabase** ([`dbSupabase.ts`](src/lib/dbSupabase.ts)) when
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. Shared board.
- **IndexedDB** ([`dbLocal.ts`](src/lib/dbLocal.ts)) when they are not. Own
  browser. The bar says **Local only** in amber, because not being told you are
  looking at your own browser is how somebody writes up an interview nobody
  else ever sees.

Nothing above `db.ts` knows which. The store already treated every call as
async and already refetched after a write, so the network round-trip changed no
caller.

### Applying the schema

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_open_access.sql
```

Or paste them into the SQL editor. Each ends with a query that says whether it
landed. `0002` is what makes the tables writable without auth — without it every
write comes back `42501 new row violates row-level security policy`, and the app
says so with the reason rather than hanging.

### Three shapes that genuinely differ

Not just spelling. The mapping lives in `dbSupabase.ts` and nowhere else.

| TS | Postgres | Why |
|----|----------|-----|
| `segment.text` | `segments.body` | `text` beside a type called `text` reads badly |
| `scheduledAt: 0` | `scheduled_at: null` | unscheduled is a state, not 1970 |
| `event.roundId: ''` | `events.round_id: null` | "about the candidate, not a round" |

`ref` now comes from a Postgres sequence rather than `max(ref) + 1`, which
raced two people adding a candidate at once. `updated_at` is set by a trigger,
so the value the app sends is ignored — a timestamp a client can choose is one
it can get wrong. `removeCandidate` no longer deletes events by hand: the
cascade does it, and the append-only policy would refuse anyway.

### Seeding a shared board

Seed row ids are deterministic (`cand_seed_noor_al_hashimi`). On IndexedDB a
localStorage flag kept a deliberately-cleared board clear; on Supabase that flag
is per-browser and meaningless for shared data — the second person to open an
empty board has no flag — so emptiness of the *server* is the test, and matching
ids make two simultaneous seeds resolve to one board instead of two.

### Security, as it actually stands

Auth is deliberately not wired, so `0002` grants the `anon` role full access.
The anon key ships inside a JavaScript bundle on a public URL: it is an
identifier, not a secret. **Anyone who finds the deployed site can read and
write every row — candidate names, phone numbers, email addresses and complete
interview transcripts — from outside noon and without signing in.** Fine for the
fictional seed; worth revisiting before real candidates go in, since it is their
data.

RLS stays *enabled* with policies that read `using (true)` rather than being
switched off, so closing it is a swap of five policies and nothing else. The
reverse of `0002` is written out at the top of that file, and `is_team()` is
already in the database waiting for it.

Note: this Supabase project is shared with the **live RnR poll** (`votes`, 51
rows). The migrations drop only this app's four tables by name for that reason —
`drop schema public cascade` would have taken it out.

## What this does not do yet

- **No auth.** See above — the deployed board is world-readable and
  world-writable. `is_team()` and the policy swap are ready; what is missing is
  a sign-in.
- **Nothing fetches the transcript for you.** Somebody has to download it from
  the meeting and paste it in. A Zoom API integration would remove that step and
  is the obvious next thing; the parser already handles what Zoom exports.
- **The paste replaces, it does not merge.** A second paste of the same meeting
  is treated as a correction, because appending would silently double a
  transcript and nobody would notice until they read the same answer twice.
