/**
 * Minimal per-device daily budget guard.
 *
 * Phase 1 caps (plan values):
 *   - CRYSTAL_TRIAL_DAILY_RUN_CAP = 10
 *   - CRYSTAL_TRIAL_DAILY_TOKEN_CAP = 500_000
 *
 * The guard runs BEFORE Workflow creation so over-cap requests never
 * reach the Workflow engine.
 */

import { utcDay } from '../repositories/usageCountersRepo';
import type { IUsageCountersRepo } from '../repositories/usageCountersRepo';

export const CRYSTAL_TRIAL_DAILY_RUN_CAP = 10;
export const CRYSTAL_TRIAL_DAILY_TOKEN_CAP = 500_000;

export interface BudgetCheckResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export async function assertBelowDailyCap(
  deviceId: string,
  usage: IUsageCountersRepo,
): Promise<BudgetCheckResult> {
  const today = utcDay(new Date());
  const counter = await usage.get(deviceId, today);

  if (counter && counter.runs_started >= CRYSTAL_TRIAL_DAILY_RUN_CAP) {
    return { ok: false, code: 'budget:over-cap', message: 'daily run cap exceeded' };
  }

  const estimatedTokens = (counter?.tokens_in ?? 0) + (counter?.tokens_out ?? 0);
  if (estimatedTokens >= CRYSTAL_TRIAL_DAILY_TOKEN_CAP) {
    return { ok: false, code: 'budget:over-cap', message: 'daily token estimate cap exceeded' };
  }

  return { ok: true };
}
