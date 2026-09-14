/**
 * The store. One place that holds the board, and one path for every write.
 *
 * Two rules carried over from Inspect, both of them learned the hard way:
 *
 * **Every write goes through `db`.** `patch*` mutates the in-memory row and
 * persists it in the same call, so there is no such thing as a change that is
 * on screen but not on disk. The tool is a record; a lost edit is the only bug
 * that matters here.
 *
 * **Selectors must be referentially stable.** `useStore((s) => s.rounds.filter(…))`
 * builds a new array on every read, the snapshot never compares equal, and React
 * re-renders until it gives up. Select the list; narrow it in a `useMemo`.
 *
 * **The store owns the activity log.** It is derived here, from the difference
 * between the stored row and the patch, rather than written by callers — so
 * every path that edits a round records itself for free and a new edit surface
 * cannot forget to log. See `lib/events.ts` for what is and is not recorded.
 */

import { create } from 'zustand';
import { backend, db } from './db';
import { buildSeed } from './seed';
import { newId } from './id';
import { byLadder, ladderFor } from './ladder';
import { inProcess } from './candidateStatus';
import { actor, actorEmail } from './me';
import { candidateEvents, roundEvents } from './events';
import type { TCandidate, TEvent, TRound, TSegment } from '../types';

const SEED_FLAG = 'design-interviews.seeded';

/**
 * The in-flight load.
 *
 * `load()` is called from an effect, and StrictMode runs effects twice in
 * development — two concurrent calls, both of which read an empty database,
 * both of which decide to seed it, and the board opens with every candidate
 * and every round duplicated. Two mounts must share one load, so the second
 * caller awaits the first one's promise rather than starting its own.
 *
 * Module scope rather than store state on purpose: the guard has to exist
 * before the first `set` lands, which is exactly the window it is guarding.
 */
let loading: Promise<void> | null = null;

type TState = {
  ready: boolean;
  /**
   * What went wrong loading the board, if anything.
   *
   * New with the backend. IndexedDB could not really fail — it is in the same
   * process — so `load()` never had a failure path and a rejection left the app
   * on "Opening the record…" for ever with an unhandled promise behind it. A
   * network call can fail for a dozen ordinary reasons (no policy, no project,
   * no wifi) and every one of them has to be readable, because "the tool is
   * broken" and "the tool is empty" look identical otherwise.
   */
  error: string;
  candidates: TCandidate[];
  rounds: TRound[];
  /** The whole log, newest first. Small — a few dozen lines per candidate —
   *  and every view that shows activity needs it, so it is held rather than
   *  read per row. Transcripts are the opposite and are not held. */
  events: TEvent[];

  load: () => Promise<void>;
  /** The body of `load`, split out so the guard above it owns the one
   *  try/catch rather than the whole thing being wrapped in an indent. */
  loadInner: () => Promise<void>;

  addCandidate: (partial?: Partial<TCandidate>) => Promise<string>;
  patchCandidate: (id: string, patch: Partial<TCandidate>) => Promise<void>;
  /** Takes the rounds and the transcripts with it. A candidate row with
   *  orphaned rounds behind it is worse than no row. */
  removeCandidate: (id: string) => Promise<void>;

  patchRound: (id: string, patch: Partial<TRound>) => Promise<void>;
  /** Make a given rung the candidate's current round. See the implementation
   *  for what that costs — it is not only a change to the round named. */
  moveToRound: (candidateId: string, kind: TRound['kind']) => Promise<void>;
  /** Brings a candidate's rounds in line with the current ladder. Adds any rung
   *  they are missing and drops one that is no longer on the ladder — but only
   *  if nothing ever happened in it. */
  syncLadder: (candidateId: string) => Promise<void>;

  importDoc: (candidates: TCandidate[], rounds: TRound[]) => Promise<void>;
  clearAll: () => Promise<void>;

  /** Transcripts are not held in the store — they are loaded per round by the
   *  views that show them. These are the writes. */
  saveSegments: (rows: TSegment[]) => Promise<void>;
  patchSegment: (row: TSegment) => Promise<void>;

  /** For the handful of things that are worth logging but are not a field
   *  changing — a round being created, a transcript being started. */
  note: (candidateId: string, roundId: string, what: string) => Promise<void>;
};

const stamp = <T extends { updatedAt: number }>(row: T): T => ({ ...row, updatedAt: Date.now() });

/** A blank round on a rung. One factory, because three paths create them and a
 *  field added to the row otherwise has to be remembered in all three. */
const blankRound = (
  candidateId: string,
  rung: { kind: TRound['kind']; durationMin: number; owners: string[]; either?: boolean },
): TRound => {
  const now = Date.now();
  return {
    id: newId('round'),
    candidateId,
    kind: rung.kind,
    // Pre-assigned to whoever runs this round. "Portfolio with Ayaneshu" is how
    // the process is described out loud, and an unassigned round is one nobody
    // is going to book. Editable on the round like any other panel.
    //
    // A pair gets both names; a choice gets the first, because booking two
    // people into a round only one of them will run is a panel somebody has to
    // correct. See `TRung.either`.
    interviewers: rung.either ? rung.owners.slice(0, 1) : [...rung.owners],
    scheduledAt: 0,
    durationMin: rung.durationMin,
    status: 'scheduled',
    decision: 'pending',
    scores: {},
    notes: '',
    zoomUrl: '',
    recordingUrl: '',
    lineCount: 0,
    createdAt: now,
    updatedAt: now,
  };
};

/** Sentences to rows. One `t` for the whole batch, nudged apart by index, so a
 *  patch that changed three things reads back in the order it happened rather
 *  than in whatever order equal timestamps sort into. */
const toEvents = (candidateId: string, roundId: string, whats: string[]): TEvent[] => {
  const t = Date.now();
  const who = actor();
  const email = actorEmail();
  return whats.map((what, i) => ({
    id: newId('ev'),
    candidateId,
    roundId,
    t: t + i,
    actor: who,
    actorEmail: email,
    what,
  }));
};

export const useStore = create<TState>((set, get) => ({
  ready: false,
  error: '',
  candidates: [],
  rounds: [],
  events: [],

  load: () => {
    if (loading) return loading;

    loading = (async () => {
      try {
        await get().loadInner();
      } catch (e) {
        // Cleared so a retry is possible: a failed load must not leave the
        // guard holding a rejected promise every later caller awaits.
        loading = null;
        set({ ready: true, error: e instanceof Error ? e.message : String(e) });
      }
    })();

    return loading;
  },

  loadInner: async () => {
    {
      let [candidates, rounds] = await Promise.all([db.candidates.all(), db.rounds.all()]);
      const events = await db.events.all();

      // Seeded only into an empty board.
      //
      // On IndexedDB the flag is what makes a board somebody deliberately
      // cleared stay cleared. On Supabase the flag is per-browser and therefore
      // meaningless for shared data — the second person to open an empty board
      // has no flag — so emptiness of the *server* is the only sensible test,
      // and the seed's ids are deterministic so two people seeding at once
      // resolve to one board rather than two. See `seedId` in `seed.ts`.
      // Seeded only on the local backend.
      //
      // The seed exists so a first run is a working funnel rather than an empty
      // table with no way to tell whether the filters do anything. That is a
      // prototype's problem. A shared board is somebody's actual hiring record,
      // and eight fictional candidates appearing in it is not a convenience —
      // it is a board you cannot trust and have to clean up, which is exactly
      // what happened.
      //
      // So: Supabase boards start empty and stay empty. Clearing one keeps it
      // cleared, which "reseed when the rows are missing" could never do
      // without a server-side marker. The empty states on both boards point at
      // Import and Add candidate.
      const seed = backend() === 'local' && !localStorage.getItem(SEED_FLAG) ? buildSeed() : null;
      if (seed) {
        localStorage.setItem(SEED_FLAG, '1');
        // Candidates, then rounds, then the log — awaited in that order,
        // because a round references its candidate and an event references
        // both. One request per table rather than per row.
        await db.candidates.putMany(seed.candidates);
        await db.rounds.putMany(seed.rounds);
        await db.events.putMany(seed.events, true);
        [candidates, rounds] = await Promise.all([db.candidates.all(), db.rounds.all()]);
        events.length = 0;
        events.push(...(await db.events.all()));
      }

      set({
        candidates: candidates.sort((a, b) => b.ref - a.ref),
        rounds,
        events: events.sort((a, b) => b.t - a.t),
        ready: true,
      });

      // The ladder is a list in source, not a row in the database, so a change
      // to it leaves every stored candidate out of step with it. Reconciling on
      // open is what makes editing `lib/ladder.ts` the way the process is
      // changed: rungs that were added appear, empty rounds for rungs that were
      // dropped go, and anything that actually happened is kept.
      const drifted = candidates.filter((c) => {
        if (!inProcess(c.status)) return false;
        const want = new Set(ladderFor(c.track).map((r) => r.kind));
        const mine = rounds.filter((r) => r.candidateId === c.id);
        // Missing a rung their track has, or holding one it does not.
        return mine.length < want.size || mine.some((r) => !want.has(r.kind));
      });
      for (const c of drifted) await get().syncLadder(c.id);
    }
  },

  note: async (candidateId, roundId, what) => {
    const rows = toEvents(candidateId, roundId, [what]);
    await db.events.putMany(rows);
    set((st) => ({ events: [...rows, ...st.events] }));
  },

  addCandidate: async (partial) => {
    const now = Date.now();
    const ref = Math.max(100, ...get().candidates.map((c) => c.ref)) + 1;
    const row: TCandidate = {
      id: newId('cand'),
      ref,
      name: '',
      role: '',
      level: 'IC3',
      location: '',
      portfolio: '',
      email: '',
      phone: '',
      previousCompany: '',
      previousPosition: '',
      source: '',
      track: 'product',
      // Added, not shortlisted. Nobody has decided to interview them yet, and
      // that decision is what creates their rounds.
      status: 'pending',
      notes: '',
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
    await db.candidates.put(row);

    const created = toEvents(row.id, '', ['Added to the funnel']);
    await db.events.putMany(created);

    set((s) => ({
      candidates: [row, ...s.candidates],
      events: [...created, ...s.events],
    }));

    // Only if they were added straight into the process — an import can carry
    // a status, and adding by hand cannot.
    if (inProcess(row.status)) await get().syncLadder(row.id);
    return row.id;
  },

  patchCandidate: async (id, patch) => {
    const current = get().candidates.find((c) => c.id === id);
    if (!current) return;
    const next = stamp({ ...current, ...patch });
    const rows = toEvents(id, '', candidateEvents(current, patch));
    await db.candidates.put(next);
    await db.events.putMany(rows);
    set((s) => ({
      candidates: s.candidates.map((c) => (c.id === id ? next : c)),
      events: rows.length > 0 ? [...rows, ...s.events] : s.events,
    }));

    // Shortlisting is what moves someone into rounds. Entering the process
    // generates the ladder; leaving it again never takes it away, because by
    // then the rounds may be the record of why they left.
    const entered = !inProcess(current.status) && inProcess(next.status);
    // Moving track means a different ladder. The rounds of the old one are
    // kept if anything happened in them — see the stale rule in `syncLadder`.
    const switched = patch.track !== undefined && patch.track !== current.track;
    if (entered || switched) await get().syncLadder(id);
  },

  removeCandidate: async (id) => {
    const rounds = get().rounds.filter((r) => r.candidateId === id);
    for (const r of rounds) {
      const segs = await db.segments.byRound(r.id);
      await Promise.all(segs.map((s) => db.segments.del(s.id)));
      await db.rounds.del(r.id);
    }
    // The trail goes with the person. An event whose candidate is gone is a
    // sentence about nobody, and the log is keyed on `candidateId`.
    const trail = await db.events.byCandidate(id);
    await Promise.all(trail.map((e) => db.events.del(e.id)));
    await db.candidates.del(id);
    set((s) => ({
      candidates: s.candidates.filter((c) => c.id !== id),
      rounds: s.rounds.filter((r) => r.candidateId !== id),
      events: s.events.filter((e) => e.candidateId !== id),
    }));
  },

  patchRound: async (id, patch) => {
    const current = get().rounds.find((r) => r.id === id);
    if (!current) return;
    const next = stamp({ ...current, ...patch });
    // The log is derived before the write, because it describes a
    // before-and-after that no longer exists once the row is replaced.
    const rows = toEvents(current.candidateId, id, roundEvents(current, patch));
    await db.rounds.put(next);
    await db.events.putMany(rows);
    set((s) => ({
      rounds: s.rounds.map((r) => (r.id === id ? next : r)),
      events: rows.length > 0 ? [...rows, ...s.events] : s.events,
    }));
  },

  /**
   * Move somebody to a round.
   *
   * "Current" is derived, not stored — `whereNow` on the board reads the first
   * round that is not finished — so moving somebody is a statement about the
   * rounds *before* the one named: they are behind them now. Everything earlier
   * that was still open is marked complete, and the target is reopened.
   *
   * That is a real edit to several rounds and it is deliberately not silent:
   * each one goes through `patchRound`, so the activity log gets a line per
   * round and anybody reading it later can see that a round was closed by a
   * move rather than by somebody sitting in it. Skipping ahead is a normal
   * thing to do and a normal thing to have to explain afterwards.
   *
   * Moving backwards costs nothing: the earlier rounds are already complete, so
   * only the target is reopened. Rounds after it are left exactly as they are.
   *
   * Skipped rounds are marked **complete**, not cancelled. Moving somebody past
   * a round is the assertion that it is behind them; a round that genuinely did
   * not happen is *cancelled*, which is a different statement and is set on the
   * round itself. `whereNow` steps over both.
   *
   * Sequential rather than `Promise.all`: every write refetches, and firing four
   * patches at one candidate concurrently races the store's own reload.
   */
  moveToRound: async (candidateId, kind) => {
    const order = ladderFor(
      get().candidates.find((c) => c.id === candidateId)?.track ?? 'product',
    ).map((r) => r.kind);
    const mine = get()
      .rounds.filter((r) => r.candidateId === candidateId)
      .sort(byLadder(order));

    const target = mine.find((r) => r.kind === kind);
    if (!target) return;
    const at = mine.indexOf(target);

    for (const r of mine.slice(0, at)) {
      if (r.status === 'scheduled' || r.status === 'in_progress') {
        await get().patchRound(r.id, { status: 'complete' });
      }
    }
    if (target.status !== 'scheduled') {
      await get().patchRound(target.id, { status: 'scheduled' });
    }
  },

  syncLadder: async (candidateId) => {
    const cand = get().candidates.find((c) => c.id === candidateId);
    if (!cand) return;
    const have = get().rounds.filter((r) => r.candidateId === candidateId);

    // Someone nobody has shortlisted has no rounds — not four empty ones. The
    // rounds board is a list of conversations somebody intends to have, and a
    // hundred imported CVs would otherwise put four hundred rows on it.
    const want = inProcess(cand.status) ? ladderFor(cand.track) : [];

    const missing = want.filter((rung) => !have.some((r) => r.kind === rung.kind));
    const added = missing.map((rung) => blankRound(candidateId, rung as Parameters<typeof blankRound>[1]));

    // A round whose rung is no longer on the ladder is only removed if nothing
    // ever happened in it. Changing the process must not delete a conversation
    // that took place under the old one — an empty slot is an artefact, a
    // scored round with a transcript is a record.
    const stale = have.filter(
      (r) =>
        !want.some((rung) => rung.kind === r.kind) &&
        r.status === 'scheduled' &&
        r.decision === 'pending' &&
        // A transcript is a conversation that happened, whatever else is
        // blank on the row.
        !r.lineCount &&
        !r.zoomUrl.trim() &&
        !r.recordingUrl.trim() &&
        !r.notes.trim(),
    );

    // Safe to run together: every one of these rounds belongs to a candidate
    // that already exists, so there is no foreign key to race.
    await Promise.all([...added.map((r) => db.rounds.put(r)), ...stale.map((r) => db.rounds.del(r.id))]);
    set((s) => ({
      rounds: [...s.rounds.filter((r) => !stale.some((x) => x.id === r.id)), ...added],
    }));
  },

  importDoc: async (candidates, rounds) => {
    const created = candidates.flatMap((c) => toEvents(c.id, '', ['Imported']));
    // Same ordering as the seed, for the same reason: rounds have a foreign key
    // to candidates, so they cannot be written alongside them.
    await db.candidates.putMany(candidates);
    await db.rounds.putMany(rounds);
    await db.events.putMany(created);
    localStorage.setItem(SEED_FLAG, '1');
    set((s) => ({
      candidates: [...candidates, ...s.candidates].sort((a, b) => b.ref - a.ref),
      rounds: [...s.rounds, ...rounds],
      events: [...created, ...s.events],
    }));

    // An import can carry a status. Anyone who arrived already shortlisted gets
    // their ladder now; the rest wait for somebody to decide.
    for (const c of candidates) {
      if (inProcess(c.status)) await get().syncLadder(c.id);
    }
  },

  clearAll: async () => {
    for (const c of get().candidates) await get().removeCandidate(c.id);
    localStorage.setItem(SEED_FLAG, '1');
    set({ candidates: [], rounds: [], events: [] });
  },

  saveSegments: async (rows) => {
    await db.segments.putMany(rows);
  },

  patchSegment: async (row) => {
    await db.segments.put(row);
  },
}));

/** The candidate a round belongs to. Used everywhere a round is shown, because
 *  a round without a name on it is unreadable. */
export const candidateOf = (candidates: TCandidate[], round: TRound): TCandidate | undefined =>
  candidates.find((c) => c.id === round.candidateId);
