/**
 * Per-device daily budget guard backed by Cloudflare D1.
 *
 * D1 owns queryable usage state. Reservation is a conditional SQLite update:
 * a run is counted only when the row is still below both run and token caps.
 */

import { utcDay } from '../repositories/usageCountersRepo';
import type { PipelineKind } from '../repositories/types';

export const PIPELINE_BUDGET_CAPS: Record<
  PipelineKind,
  { runsPerDay: number; tokensPerDay: number }
> = {
  'crystal-trial': { runsPerDay: 10, tokensPerDay: 500_000 },
  'topic-content': { runsPerDay: 30, tokensPerDay: 4_000_000 },
  'topic-expansion': { runsPerDay: 60, tokensPerDay: 1_500_000 },
  'subject-graph': { runsPerDay: 8, tokensPerDay: 800_000 },
};

export const CRYSTAL_TRIAL_DAILY_RUN_CAP = PIPELINE_BUDGET_CAPS['crystal-trial'].runsPerDay;
export const CRYSTAL_TRIAL_DAILY_TOKEN_CAP = PIPELINE_BUDGET_CAPS['crystal-trial'].tokensPerDay;

export interface BudgetCheckResult {
  ok: boolean;
  code?: string;
  message?: string;
}

function changes(result: unknown): number {
  return (result as { meta?: { changes?: number } }).meta?.changes ?? 0;
}

export async function assertBelowDailyCap(
  deviceId: string,
  db: D1Database,
  kind: PipelineKind = 'crystal-trial',
): Promise<BudgetCheckResult> {
  const today = utcDay(new Date());
  const cap = PIPELINE_BUDGET_CAPS[kind];

  try {
    await db.prepare(`
      insert or ignore into usage_counters (device_id, day, tokens_in, tokens_out, runs_started)
      values (?, ?, 0, 0, 0)
    `).bind(deviceId, today).run();

    const result = await db.prepare(`
      update usage_counters
      set runs_started = runs_started + 1
      where device_id = ? and day = ?
        and runs_started < ?
        and (tokens_in + tokens_out) < ?
    `).bind(deviceId, today, cap.runsPerDay, cap.tokensPerDay).run();

    if (changes(result) > 0) return { ok: true };

    return {
      ok: false,
      code: 'budget:over-cap',
      message: `daily ${kind} run or token cap exceeded`,
    };
  } catch (err) {
    console.error('[budgetGuard] D1 budget reservation failed:', err);
    return {
      ok: false,
      code: 'budget:over-cap',
      message: 'Budget check unavailable; failing closed.',
    };
  }
}
