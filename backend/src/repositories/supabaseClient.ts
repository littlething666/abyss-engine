/**
 * Supabase client factory for the durable orchestrator Worker.
 *
 * Creates a service-role-authenticated Supabase client. This client is NEVER
 * exposed to the browser — it lives exclusively in the Worker's server-side
 * execution context. The `SUPABASE_SERVICE_ROLE` secret bypasses RLS and must
 * be set via `wrangler secret put`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';

let cachedClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client configured with the Worker's service-role key.
 * The client is cached per Worker isolate; a new isolate gets a fresh client.
 */
export function getSupabaseClient(env: Env): SupabaseClient {
  if (cachedClient) return cachedClient;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE must be set (wrangler secret put)',
    );
  }

  cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });

  return cachedClient;
}

/**
 * Resets the cached client. Exposed for tests only — production code must not
 * call this.
 */
export function __resetSupabaseClient(): void {
  cachedClient = null;
}
