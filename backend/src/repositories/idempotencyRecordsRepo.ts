/**
 * Idempotency Records Repository — Phase 3.6 Step 5.
 *
 * Manages the `idempotency_records` table with 24h TTL semantics.
 * Designed to work with the `check_idempotency` and `record_idempotency_key`
 * RPC functions defined in `0007_phase36_idempotency.sql`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface IdempotencyCheckResult {
  /** The existing run_id on a within-TTL hit. */
  runId: string | null;
  /** 'hit' = key valid and within TTL, 'expired' = key exists but past TTL, 'miss' = no record. */
  status: 'hit' | 'miss' | 'expired';
}

export interface IIdempotencyRecordsRepo {
  /**
   * Check if an idempotency key already exists and is within the 24h TTL.
   *
   * - hit: returns the existing runId — the caller should return 200 with it.
   * - miss: no record exists — the caller should create a run and then call record().
   * - expired: old record deleted — same as miss, caller creates a fresh run.
   */
  check(deviceId: string, key: string): Promise<IdempotencyCheckResult>;

  /**
   * Record a new idempotency key → run mapping with a 24h TTL.
   *
   * Safe to call after `check()` returns 'miss' or 'expired' and a run
   * has been created. Uses ON CONFLICT DO NOTHING so concurrent races
   * are silent; the caller should re-check if the insert was critical.
   */
  record(deviceId: string, key: string, runId: string): Promise<void>;
}

export function createIdempotencyRecordsRepo(db: SupabaseClient): IIdempotencyRecordsRepo {
  return {
    async check(deviceId, key) {
      const { data, error } = await db.rpc('check_idempotency', {
        p_device_id: deviceId,
        p_key: key,
      });

      if (error) throw error;

      const result = data as { run_id: string | null; status: string };
      return {
        runId: result.run_id ?? null,
        status: result.status as 'hit' | 'miss' | 'expired',
      };
    },

    async record(deviceId, key, runId) {
      const { error } = await db.rpc('record_idempotency_key', {
        p_device_id: deviceId,
        p_key: key,
        p_run_id: runId,
      });

      if (error) throw error;
    },
  };
}
