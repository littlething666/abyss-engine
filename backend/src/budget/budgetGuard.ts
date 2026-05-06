/**
 * Per-device daily budget guard.
 *
 * Phase 3.5: Atomic budget reservation via `reserve_run_budget` RPC.
 * The Postgres function locks the `usage_counters` row, checks caps, and
 * increments `runs_started` in one transaction — concurrent submissions
 * cannot exceed the cap.
 */

import { utcDay } from '../repositories/usageCountersRepo';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineKind } from '../repositories/types';

// ---------------------------------------------------------------------------
// Pipeline-kind budget caps (single source of truth, no magic numbers)
// ---------------------------------------------------------------------------
export const PIPELINE_BUDGET_CAPS: Record<
  PipelineKind,
  { runsPerDay: number; tokensPerDay: number }
> = {
  'crystal-trial': { runsPerDay: 10, tokensPerDay: 500_000 },
  'topic-content': { runsPerDay: 30, tokensPerDay: 4_000_000 },
  'topic-expansion': { runsPerDay: 60, tokensPerDay: 1_500_000 },
  'subject-graph': { runsPerDay: 8, tokensPerDay: 800_000 },
};

// Legacy aliases for Phase 1 compatibility.
export const CRYSTAL_TRIAL_DAILY_RUN_CAP = PIPELINE_BUDGET_CAPS['crystal-trial'].runsPerDay;
export const CRYSTAL_TRIAL_DAILY_TOKEN_CAP = PIPELINE_BUDGET_CAPS['crystal-trial'].tokensPerDay;

export interface BudgetCheckResult {
  ok: boolean;
  code?: string;
  message?: string;
}

/**
 * Atomic budget reservation via `reserve_run_budget` RPC (Phase 3.5).
 *
 * The RPC locks the `usage_counters` row for (device_id, UTC day), checks
 * run and token caps, and increments `runs_started` in a single
 * transaction. Concurrent submissions cannot exceed the cap.
 *
 * Returns `{ ok: true }` on success, `{ ok: false, code: 'budget:over-cap' }`
 * when the cap would be exceeded.
 */
export async function assertBelowDailyCap(
  deviceId: string,
  db: SupabaseClient,
  kind: PipelineKind = 'crystal-trial',
): Promise<BudgetCheckResult> {
  const today = utcDay(new Date());
  const cap = PIPELINE_BUDGET_CAPS[kind];

  const { data, error } = await db.rpc('reserve_run_budget', {
    p_device_id: deviceId,
    p_day: today,
    p_run_cap: cap.runsPerDay,
    p_token_cap: cap.tokensPerDay,
  });

  if (error) {
    // If the RPC is not yet deployed (migration hasn't run), fail closed.
    console.error(`[budgetGuard] reserve_run_budget RPC failed:`, error);
    return {
      ok: false,
      code: 'budget:over-cap',
      message: 'Budget check unavailable; failing closed.',
    };
  }

  const result = data as { ok: boolean; code?: string; message?: string };
  return result;
}
