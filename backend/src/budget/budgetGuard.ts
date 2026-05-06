/**
 * Per-device daily budget guard.
 *
 * Phase 1 caps (Crystal Trial only):
 *   - CRYSTAL_TRIAL_DAILY_RUN_CAP = 10
 *   - CRYSTAL_TRIAL_DAILY_TOKEN_CAP = 500_000
 *
 * Phase 2 caps (all four pipelines):
 *   - TOPIC_CONTENT_DAILY_RUN_CAP = 30
 *   - TOPIC_CONTENT_DAILY_TOKEN_CAP = 4_000_000
 *   - TOPIC_EXPANSION_DAILY_RUN_CAP = 60
 *   - TOPIC_EXPANSION_DAILY_TOKEN_CAP = 1_500_000
 *   - SUBJECT_GRAPH_DAILY_RUN_CAP = 8
 *   - SUBJECT_GRAPH_DAILY_TOKEN_CAP = 800_000
 */

import { utcDay } from '../repositories/usageCountersRepo';
import type { IUsageCountersRepo } from '../repositories/usageCountersRepo';
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

// Legacy aliases for Phase 1 compatibility — consumed by crystalTrialWorkflow.ts
export const CRYSTAL_TRIAL_DAILY_RUN_CAP = PIPELINE_BUDGET_CAPS['crystal-trial'].runsPerDay;
export const CRYSTAL_TRIAL_DAILY_TOKEN_CAP = PIPELINE_BUDGET_CAPS['crystal-trial'].tokensPerDay;

export interface BudgetCheckResult {
  ok: boolean;
  code?: string;
  message?: string;
}

/**
 * Guard that rejects over-cap submissions BEFORE Workflow creation.
 *
 * @param deviceId  the device identifier
 * @param usage     usage counters repository
 * @param kind      pipeline kind — determines which cap to enforce
 */
export async function assertBelowDailyCap(
  deviceId: string,
  usage: IUsageCountersRepo,
  kind: PipelineKind = 'crystal-trial',
): Promise<BudgetCheckResult> {
  const today = utcDay(new Date());
  const counter = await usage.get(deviceId, today);
  const cap = PIPELINE_BUDGET_CAPS[kind];

  if (counter && counter.runs_started >= cap.runsPerDay) {
    return {
      ok: false,
      code: 'budget:over-cap',
      message: `${kind} daily run cap (${cap.runsPerDay}) exceeded`,
    };
  }

  const estimatedTokens = (counter?.tokens_in ?? 0) + (counter?.tokens_out ?? 0);
  if (estimatedTokens >= cap.tokensPerDay) {
    return {
      ok: false,
      code: 'budget:over-cap',
      message: `${kind} daily token estimate cap (${cap.tokensPerDay}) exceeded`,
    };
  }

  return { ok: true };
}
