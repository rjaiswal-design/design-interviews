import { client } from './supabase';
import type { TCandidate, TEvent, TRound, TSegment } from '../types';

/**
 * The Supabase backend.
 *
 * Everything here is row mapping. The schema is snake_case and the app is
 * camelCase, and three fields genuinely differ in shape rather than just in
 * spelling — this file is the only place that knows about either, which is the
 * whole point of `db.ts` being a seam.
 *
 *   TS                  Postgres
 *   ──────────────────  ──────────────────────────────────────────────────────
 *   segment.text        segments.body      `text` beside a type called `text`
 *   scheduledAt: 0      scheduled_at: null unscheduled is a state, not 1970
 *   event.roundId: ''   events.round_id: null
 *
 * Reads are mapped back the other way, so nothing above this file ever sees a
 * null where it expects a number or an empty string.
 *
 * `updated_at` is set by a trigger, so the value sent here is ignored — which
 * is correct: a timestamp a client can choose is one it can get wrong.
 */

const sb = () => {
  if (!client) throw new Error('No Supabase client. dbSupabase used without a configured project.');
  return client;
};

/** Postgres errors carry the detail; `throw` on them rather than returning
 *  empty, because a silently empty board is indistinguishable from a real one. */
const orThrow = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

// ── candidates ──────────────────────────────────────────────────────────────

type TCandidateRow = {
  id: string;
  ref: number;
  name: string;
  track: TCandidate['track'];
  status: TCandidate['status'];
  role: string;
  location: string;
  portfolio: string;
  linkedin: string;
  email: string;
  phone: string;
  previous_company: string;
  previous_position: string;
  source: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

const toCandidate = (r: TCandidateRow): TCandidate => ({
  id: r.id,
  ref: r.ref,
  name: r.name,
  track: r.track,
  status: r.status,
  role: r.role,
  location: r.location,
  portfolio: r.portfolio,
  linkedin: r.linkedin ?? '',
  email: r.email,
  phone: r.phone,
  previousCompany: r.previous_company,
  previousPosition: r.previous_position,
  source: r.source,
  notes: r.notes,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
});

const fromCandidate = (c: TCandidate) => ({
  id: c.id,
  ref: c.ref,
  name: c.name,
  track: c.track,
  status: c.status,
  role: c.role,
  location: c.location,
  portfolio: c.portfolio,
  linkedin: c.linkedin,
  email: c.email,
  phone: c.phone,
  previous_company: c.previousCompany,
  previous_position: c.previousPosition,
  source: c.source,
  notes: c.notes,
});

// ── rounds ──────────────────────────────────────────────────────────────────

type TRoundRow = {
  id: string;
  candidate_id: string;
  kind: TRound['kind'];
  interviewers: string[];
  scheduled_at: string | null;
  duration_min: number;
  status: TRound['status'];
  decision: TRound['decision'];
  scores: TRound['scores'];
  notes: string;
  zoom_url: string;
  recording_url: string;
  line_count: number;
  created_at: string;
  updated_at: string;
};

const toRound = (r: TRoundRow): TRound => ({
  id: r.id,
  candidateId: r.candidate_id,
  kind: r.kind,
  interviewers: r.interviewers ?? [],
  // Null is unscheduled. The app carries 0 for that, and every sort and filter
  // above here is written against a number.
  scheduledAt: r.scheduled_at ? Date.parse(r.scheduled_at) : 0,
  durationMin: r.duration_min,
  status: r.status,
  decision: r.decision,
  scores: r.scores ?? {},
  notes: r.notes,
  zoomUrl: r.zoom_url,
  recordingUrl: r.recording_url,
  lineCount: r.line_count,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
});

const fromRound = (r: TRound) => ({
  id: r.id,
  candidate_id: r.candidateId,
  kind: r.kind,
  interviewers: r.interviewers,
  scheduled_at: r.scheduledAt ? new Date(r.scheduledAt).toISOString() : null,
  duration_min: r.durationMin,
  status: r.status,
  decision: r.decision,
  scores: r.scores,
  notes: r.notes,
  zoom_url: r.zoomUrl,
  recording_url: r.recordingUrl,
  line_count: r.lineCount,
});

// ── segments ────────────────────────────────────────────────────────────────

type TSegmentRow = {
  id: string;
  round_id: string;
  t: number;
  speaker: TSegment['speaker'];
  speaker_name: string;
  body: string;
  starred: boolean;
  manual: boolean;
};

const toSegment = (s: TSegmentRow): TSegment => ({
  id: s.id,
  roundId: s.round_id,
  t: s.t,
  speaker: s.speaker,
  speakerName: s.speaker_name ?? '',
  text: s.body,
  starred: s.starred,
  manual: s.manual,
});

const fromSegment = (s: TSegment) => ({
  id: s.id,
  round_id: s.roundId,
  t: s.t,
  speaker: s.speaker,
  speaker_name: s.speakerName,
  body: s.text,
  starred: s.starred,
  manual: s.manual,
});

// ── events ──────────────────────────────────────────────────────────────────

type TEventRow = {
  id: string;
  candidate_id: string;
  round_id: string | null;
  t: string;
  actor: string;
  actor_email: string;
  what: string;
};

const toEvent = (e: TEventRow): TEvent => ({
  id: e.id,
  candidateId: e.candidate_id,
  roundId: e.round_id ?? '',
  t: Date.parse(e.t),
  actor: e.actor,
  actorEmail: e.actor_email ?? '',
  what: e.what,
});

const fromEvent = (e: TEvent) => ({
  id: e.id,
  candidate_id: e.candidateId,
  // '' means "about the candidate, not a round". Null is how that is spelled in
  // a nullable foreign key.
  round_id: e.roundId || null,
  t: new Date(e.t).toISOString(),
  actor: e.actor,
  actor_email: e.actorEmail,
  what: e.what,
});

// ── the seam's other half ───────────────────────────────────────────────────

export const supabaseDb = {
  candidates: {
    all: async (): Promise<TCandidate[]> =>
      orThrow(await sb().from('candidates').select('*')).map(toCandidate),
    put: async (row: TCandidate): Promise<void> => {
      orThrow(await sb().from('candidates').upsert(fromCandidate(row)).select('id'));
    },
    putMany: async (rows: TCandidate[]): Promise<void> => {
      if (rows.length === 0) return;
      orThrow(await sb().from('candidates').upsert(rows.map(fromCandidate)).select('id'));
    },
    del: async (id: string): Promise<void> => {
      // The cascades in 0001 take this candidate's rounds, segments and log
      // with them, which is why nothing above here deletes those by hand.
      orThrow(await sb().from('candidates').delete().eq('id', id).select('id'));
    },
  },

  rounds: {
    all: async (): Promise<TRound[]> => orThrow(await sb().from('rounds').select('*')).map(toRound),
    put: async (row: TRound): Promise<void> => {
      orThrow(await sb().from('rounds').upsert(fromRound(row)).select('id'));
    },
    putMany: async (rows: TRound[]): Promise<void> => {
      if (rows.length === 0) return;
      // Conflict on `(candidate_id, kind)`, not on the primary key.
      //
      // That pair *is* the identity of a round — one round per rung per
      // candidate, which is the unique constraint in 0001 and the thing that
      // makes a ladder drawable as a track. Upserting on `id` instead let a
      // batch collide with a row for the same rung that had been created
      // another way and therefore carried a different id:
      // `duplicate key value violates unique constraint
      // "rounds_candidate_id_kind_key"`. Conflicting on the natural key means
      // a seed or an import can never produce a second round for a rung.
      orThrow(
        await sb()
          .from('rounds')
          .upsert(rows.map(fromRound), { onConflict: 'candidate_id,kind' })
          .select('id'),
      );
    },
    del: async (id: string): Promise<void> => {
      orThrow(await sb().from('rounds').delete().eq('id', id).select('id'));
    },
  },

  segments: {
    byRound: async (roundId: string): Promise<TSegment[]> =>
      orThrow(await sb().from('segments').select('*').eq('round_id', roundId).order('t')).map(
        toSegment,
      ),
    put: async (row: TSegment): Promise<void> => {
      orThrow(await sb().from('segments').upsert(fromSegment(row)).select('id'));
    },
    putMany: async (rows: TSegment[]): Promise<void> => {
      if (rows.length === 0) return;
      orThrow(await sb().from('segments').upsert(rows.map(fromSegment)).select('id'));
    },
    del: async (id: string): Promise<void> => {
      orThrow(await sb().from('segments').delete().eq('id', id).select('id'));
    },
  },

  events: {
    all: async (): Promise<TEvent[]> =>
      orThrow(await sb().from('events').select('*').order('t', { ascending: false })).map(toEvent),
    byCandidate: async (candidateId: string): Promise<TEvent[]> =>
      orThrow(
        await sb()
          .from('events')
          .select('*')
          .eq('candidate_id', candidateId)
          .order('t', { ascending: false }),
      ).map(toEvent),
    putMany: async (rows: TEvent[], ignoreDuplicates = false): Promise<void> => {
      if (rows.length === 0) return;
      // Insert, not upsert: the log is append-only and the table has no update
      // policy, so an upsert resolving to an update would be refused rather
      // than quietly doing nothing.
      //
      // `ignoreDuplicates` is `on conflict do nothing`, which needs no update
      // policy either. Only the seed passes it — a repairing run re-offers
      // lines that are already there, and for a real append a duplicate id is a
      // bug worth hearing about.
      const q = sb().from('events');
      orThrow(
        await (ignoreDuplicates
          ? q.upsert(rows.map(fromEvent), { ignoreDuplicates: true })
          : q.insert(rows.map(fromEvent))
        ).select('id'),
      );
    },
    del: async (): Promise<void> => {
      // Deliberately a no-op. The table has no delete policy — a log that can
      // be edited is not a log — and lines go with their candidate through the
      // cascade. `removeCandidate` calls this; on Supabase it has nothing to do.
    },
  },
};
