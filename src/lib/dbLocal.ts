/**
 * The IndexedDB backend.
 *
 * What the app ran on before it had a server, and what it falls back to when no
 * Supabase project is configured — a preview deploy with no env vars, or
 * somebody poking at the UI. `db.ts` picks between this and `dbSupabase.ts`.
 *
 * Everything the app persists goes through this file and nothing else imports
 * `indexedDB`. That is the whole point of it: wiring this to Supabase or to a
 * FastAPI backend means reimplementing eight functions, not auditing the app
 * for writes. The store above it already treats every call as async and already
 * refetches after a write, so a network round-trip changes no caller.
 *
 * Four stores:
 *
 *   candidates  keyPath id
 *   rounds      keyPath id, index by candidateId
 *   segments    keyPath id, index by roundId
 *   events      keyPath id, index by candidateId — the activity log
 *
 * There was a `recordings` store holding audio Blobs. Version 3 drops it: the
 * interview happens in Zoom and its transcript is pasted in, so there is no
 * audio to keep — and deleting the store is what actually frees the megabytes
 * already sitting in someone's browser.
 *
 * Events are append-only. Nothing in the app updates or deletes one except
 * `removeCandidate`, which takes the whole trail with the person — a log that
 * can be edited is not a log.
 */

import type { TCandidate, TCandidateStatus, TEvent, TRound, TSegment } from '../types';

/**
 * A stored round, brought up to the current shape.
 *
 * Rows on disk were written by whatever version of the app was running at the
 * time, and fields added since are simply absent on them. Defaulting here — in
 * the one place rows enter the app — is the difference between one function and
 * a `?? ''` at every call site that ever touches a new field. `zoomUrl` was the
 * one that proved it: `round.zoomUrl.trim()` throws on every round written
 * before meeting links existed.
 *
 * This is a read-time default, not a migration: nothing is rewritten until the
 * row is next patched, and the row is correct in memory either way.
 */
/**
 * Rounds the single four-rung ladder produced, mapped onto the product track.
 *
 * Not "retired" — they are the same conversations under the same names, and the
 * product-design ladder is what that one ladder became when visual design got
 * its own. Retiring them would litter every existing candidate with four
 * unreadable rounds *and* five new empty ones. `intro`, `craft`, `systems` and
 * `bar` stay genuinely retired: no current rung means what they meant.
 */
const RENAMED_KIND: Record<string, TRound['kind']> = {
  portfolio: 'pd_portfolio',
  critique: 'pd_critique',
  product: 'pd_product',
  culture: 'pd_culture',
};

const hydrateRound = (r: TRound): TRound => ({
  ...r,
  kind: RENAMED_KIND[r.kind as string] ?? r.kind,
  zoomUrl: r.zoomUrl ?? '',
  recordingUrl: r.recordingUrl ?? '',
  lineCount: r.lineCount ?? 0,
  interviewers: r.interviewers ?? [],
  scores: r.scores ?? {},
  notes: r.notes ?? '',
});

/**
 * Statuses the funnel used to have, mapped onto the ones it has now.
 *
 * Read-time, like every other default here: a row written under the old enum
 * still says `active`, and a pill with no matching class renders unstyled with
 * a label of `undefined`. Mapped rather than dropped because the state is a
 * decision somebody made about a person.
 *
 * `withdrawn` has no exact home — it meant "they pulled out", at any stage,
 * where `offer_dropped` is specifically about an offer. It is the closest of
 * the six and both mean the same thing in practice: they are not coming.
 */
const LEGACY_STATUS: Record<string, TCandidateStatus> = {
  active: 'shortlisted',
  offer: 'offer_out',
  passed: 'rejected',
  withdrawn: 'offer_dropped',
};

/** Same, for a candidate. The contact and provenance fields arrived after the
 *  first rows were written, and so did the funnel's vocabulary. */
const hydrateCandidate = (c: TCandidate): TCandidate => ({
  ...c,
  // Everyone on file predates the split, and the ladder they walked is the one
  // product design kept.
  track: c.track ?? 'product',
  status: LEGACY_STATUS[c.status as string] ?? c.status,
  phone: c.phone ?? '',
  linkedin: c.linkedin ?? '',
  previousCompany: c.previousCompany ?? '',
  previousPosition: c.previousPosition ?? '',
  email: c.email ?? '',
  portfolio: c.portfolio ?? '',
  location: c.location ?? '',
  source: c.source ?? '',
  notes: c.notes ?? '',
});

/** Same, for a log line. `actorEmail` arrived with the first-run identity
 *  dialog; lines written before it have a name and no address. */
const hydrateEvent = (e: TEvent): TEvent => ({ ...e, actorEmail: e.actorEmail ?? '' });

/** Same, for a line of transcript. `speakerName` arrived with pasted
 *  transcripts; lines written before it have none. */
const hydrateSegment = (s: TSegment): TSegment => ({
  ...s,
  speakerName: s.speakerName ?? '',
  manual: s.manual ?? false,
  starred: s.starred ?? false,
});

const DB_NAME = 'design-interviews';
/** 2 added `events`. 3 dropped `recordings` — the app no longer records audio,
 *  and the blobs were the only rows in it measured in megabytes. */
const DB_VERSION = 3;

type TStore = 'candidates' | 'rounds' | 'segments' | 'events';

let handle: Promise<IDBDatabase> | null = null;

const open = (): Promise<IDBDatabase> => {
  if (handle) return handle;
  handle = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('candidates')) {
        db.createObjectStore('candidates', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('rounds')) {
        const s = db.createObjectStore('rounds', { keyPath: 'id' });
        s.createIndex('candidateId', 'candidateId');
      }
      if (!db.objectStoreNames.contains('segments')) {
        const s = db.createObjectStore('segments', { keyPath: 'id' });
        s.createIndex('roundId', 'roundId');
      }
      if (db.objectStoreNames.contains('recordings')) db.deleteObjectStore('recordings');
      if (!db.objectStoreNames.contains('events')) {
        const s = db.createObjectStore('events', { keyPath: 'id' });
        s.createIndex('candidateId', 'candidateId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return handle;
};

const tx = async <T>(
  store: TStore,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const all = <T>(store: TStore): Promise<T[]> =>
  tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);

/** Many rows, one transaction. Was written out separately for segments and for
 *  events; candidates and rounds needed it too once the seed started writing
 *  them a table at a time. */
const putAll = async <T>(store: TStore, rows: T[]): Promise<void> => {
  if (rows.length === 0) return;
  const conn = await open();
  await new Promise<void>((resolve, reject) => {
    const t = conn.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const row of rows) s.put(row);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
};

export const localDb = {
  candidates: {
    all: async () => (await all<TCandidate>('candidates')).map(hydrateCandidate),
    put: (row: TCandidate) =>
      tx('candidates', 'readwrite', (s) => s.put(row) as IDBRequest<IDBValidKey>),
    putMany: (rows: TCandidate[]) => putAll('candidates', rows),
    del: (id: string) =>
      tx('candidates', 'readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>),
  },

  rounds: {
    all: async () => (await all<TRound>('rounds')).map(hydrateRound),
    put: (row: TRound) => tx('rounds', 'readwrite', (s) => s.put(row) as IDBRequest<IDBValidKey>),
    putMany: (rows: TRound[]) => putAll('rounds', rows),
    del: (id: string) =>
      tx('rounds', 'readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>),
  },

  segments: {
    /** Only ever read a round at a time. The whole store is every word anyone
     *  has said in an interview and nothing wants all of it at once. */
    byRound: async (roundId: string): Promise<TSegment[]> => {
      const rows = await tx<TSegment[]>(
        'segments',
        'readonly',
        (s) => s.index('roundId').getAll(roundId) as IDBRequest<TSegment[]>,
      );
      // Stable within a timestamp: a pasted transcript often gives every line
      // of one cue the same `t`, and an unstable sort would shuffle them on
      // every read — the transcript would not say the same thing twice.
      return rows.map(hydrateSegment).sort((a, b) => a.t - b.t);
    },
    put: (row: TSegment) =>
      tx('segments', 'readwrite', (s) => s.put(row) as IDBRequest<IDBValidKey>),
    /** Written a line at a time while the interview runs, so this batches the
     *  whole flush into one transaction rather than one per line. */
    putMany: (rows: TSegment[]) => putAll('segments', rows),
    del: (id: string) =>
      tx('segments', 'readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>),
  },

  events: {
    all: async () => (await all<TEvent>('events')).map(hydrateEvent),
    /** Newest first — the trail is read from the top, and the one line the
     *  board shows is the most recent one. */
    byCandidate: async (candidateId: string): Promise<TEvent[]> => {
      const rows = await tx<TEvent[]>(
        'events',
        'readonly',
        (s) => s.index('candidateId').getAll(candidateId) as IDBRequest<TEvent[]>,
      );
      return rows.map(hydrateEvent).sort((a, b) => b.t - a.t);
    },
    // `ignoreDuplicates` is accepted and ignored: `put` is already an upsert
    // here, so re-offering a line it already holds is a no-op either way.
    putMany: (rows: TEvent[], _ignoreDuplicates = false) => putAll('events', rows),
    del: (id: string) =>
      tx('events', 'readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>),
  },

};
