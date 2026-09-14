import { localDb } from './dbLocal';
import { supabaseDb } from './dbSupabase';
import { backend } from './supabase';

/**
 * The storage seam.
 *
 * Two implementations behind one shape: `dbSupabase.ts` when a project is
 * configured, `dbLocal.ts` (IndexedDB) when one is not. Nothing above this file
 * knows which — the store already treats every call as async and already
 * refetches after a write, so a network round-trip changed no caller when the
 * backend arrived.
 *
 * Keeping the local implementation is not sentiment. It is what makes a preview
 * deploy with no env vars show a working board rather than an error, and the
 * fastest way to exercise the UI without touching shared data. What matters is
 * that the app says which one it is on — see `backend()` and the bar — because
 * ambiguity about whether you are looking at shared data or your own browser is
 * the worst possible state for a tool that is the record of something.
 *
 * Chosen once, at module load, not per call. A board that switched backends
 * halfway through a session would be two records pretending to be one.
 */

export const db = backend() === 'supabase' ? supabaseDb : localDb;

export { backend };
