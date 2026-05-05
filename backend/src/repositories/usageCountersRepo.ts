/**
 * Usage counters repository — per-device daily budget enforcement.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UsageCounterRow, OpenRouterUsage } from './types';

/** YYYY-MM-DD in UTC (Plan v3 Q15). */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface IUsageCountersRepo {
  /** Read the counter row for (deviceId, day). Returns null if no row yet. */
  get(deviceId: string, day: string): Promise<UsageCounterRow | null>;
  /** Increment `runs_started` by 1. Creates the row if it doesn't exist. */
  incrementRunsStarted(deviceId: string, day: string): Promise<void>;
  /** Add token usage to the daily counter. Creates the row if it doesn't exist. */
  recordTokens(deviceId: string, day: string, usage: OpenRouterUsage): Promise<void>;
}

export function createUsageCountersRepo(db: SupabaseClient): IUsageCountersRepo {
  return {
    async get(deviceId: string, day: string) {
      const { data, error } = await db
        .from('usage_counters')
        .select('*')
        .eq('device_id', deviceId)
        .eq('day', day)
        .maybeSingle();

      if (error) throw error;
      return (data as UsageCounterRow) ?? null;
    },

    async incrementRunsStarted(deviceId: string, day: string) {
      const { error } = await db.rpc('increment_runs_started', {
        p_device_id: deviceId,
        p_day: day,
      });

      if (error) throw error;
    },

    async recordTokens(deviceId: string, day: string, usage: OpenRouterUsage) {
      const tokensIn = usage.prompt_tokens ?? 0;
      const tokensOut = usage.completion_tokens ?? 0;

      // Upsert via a raw call since we need an atomic increment.
      const { error } = await db.rpc('record_tokens', {
        p_device_id: deviceId,
        p_day: day,
        p_tokens_in: tokensIn,
        p_tokens_out: tokensOut,
      });

      if (error) throw error;
    },
  };
}
