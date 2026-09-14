import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client, or nothing.
 *
 * `client` is null when the environment has no project configured, and that is
 * a supported state rather than a crash: `db.ts` falls back to IndexedDB, so
 * the app still runs with no backend at all. That is how it started, it is
 * still the fastest way to poke at the UI, and it means a preview deploy
 * without env vars shows a working board instead of an error.
 *
 * `backend()` is what the UI reads to say which one it is on. Ambiguity about
 * whether you are looking at shared data or your own browser is the worst
 * possible state for a tool that is the record of something.
 *
 * The anon key belongs in the bundle — it is an identifier, not a secret, and
 * row-level security is what actually protects the rows. See
 * `supabase/migrations/0002_open_access.sql` for what those policies currently
 * allow, which is everything.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const client: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          // Nothing signs in yet, so there is no session to persist and no
          // token to refresh. Left explicit: when auth arrives this is the
          // line that changes.
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

export const backend = (): 'supabase' | 'local' => (client ? 'supabase' : 'local');
