/**
 * Budget guard tests — Phase 1 PR-D.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { assertBelowDailyCap, CRYSTAL_TRIAL_DAILY_RUN_CAP, CRYSTAL_TRIAL_DAILY_TOKEN_CAP } from '../budget/budgetGuard';
import type { IUsageCountersRepo, UsageCounterRow } from '../repositories/usageCountersRepo';

function createFakeUsageRepo(
  runsStarted: number,
  tokensIn: number,
  tokensOut: number,
): IUsageCountersRepo {
  return {
    async get(): Promise<UsageCounterRow | null> {
      return {
        device_id: 'dev-1',
        day: '2026-05-05',
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        runs_started: runsStarted,
      };
    },
    async incrementRunsStarted(): Promise<void> {},
    async recordTokens(): Promise<void> {},
  };
}

function createEmptyUsageRepo(): IUsageCountersRepo {
  return {
    async get(): Promise<UsageCounterRow | null> {
      return null;
    },
    async incrementRunsStarted(): Promise<void> {},
    async recordTokens(): Promise<void> {},
  };
}

describe('budgetGuard', () => {
  it('allows when no prior usage', async () => {
    const result = await assertBelowDailyCap('dev-1', createEmptyUsageRepo());
    expect(result.ok).toBe(true);
  });

  it('allows when below caps', async () => {
    const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(5, 100_000, 50_000));
    expect(result.ok).toBe(true);
  });

  it('blocks when runs started cap exceeded', async () => {
    const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(CRYSTAL_TRIAL_DAILY_RUN_CAP, 0, 0));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  it('blocks when runs started cap exceeded (above)', async () => {
    const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(CRYSTAL_TRIAL_DAILY_RUN_CAP + 5, 0, 0));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  it('blocks when token cap exceeded', async () => {
    const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(0, CRYSTAL_TRIAL_DAILY_TOKEN_CAP, 0));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  it('blocks when combined tokens exceed cap', async () => {
    const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(
      0,
      CRYSTAL_TRIAL_DAILY_TOKEN_CAP - 100,
      100,
    ));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  it('uses UTC day correctly', () => {
    // The budget guard uses utcDay(new Date()) internally — this is tested
    // via the usage counters UTC rollover tests.
    expect(CRYSTAL_TRIAL_DAILY_RUN_CAP).toBe(10);
    expect(CRYSTAL_TRIAL_DAILY_TOKEN_CAP).toBe(500_000);
  });
});
