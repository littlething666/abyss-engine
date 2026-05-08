/** Usage counters repository — per-device daily budget accounting in D1. */

import type { UsageCounterRow, OpenRouterUsage } from './types';

/** YYYY-MM-DD in UTC. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface IUsageCountersRepo {
  get(deviceId: string, day: string): Promise<UsageCounterRow | null>;
  recordTokens(deviceId: string, day: string, usage: OpenRouterUsage): Promise<void>;
}

export function createUsageCountersRepo(db: D1Database): IUsageCountersRepo {
  return {
    async get(deviceId, day) {
      return await db.prepare(`
        select * from usage_counters where device_id = ? and day = ?
      `).bind(deviceId, day).first<UsageCounterRow>();
    },

    async recordTokens(deviceId, day, usage) {
      const tokensIn = usage.prompt_tokens ?? 0;
      const tokensOut = usage.completion_tokens ?? 0;
      await db.prepare(`
        insert into usage_counters (device_id, day, tokens_in, tokens_out, runs_started)
        values (?, ?, ?, ?, 0)
        on conflict(device_id, day) do update set
          tokens_in = usage_counters.tokens_in + excluded.tokens_in,
          tokens_out = usage_counters.tokens_out + excluded.tokens_out
      `).bind(deviceId, day, tokensIn, tokensOut).run();
    },
  };
}
