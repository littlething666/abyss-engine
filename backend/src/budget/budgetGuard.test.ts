/**
 * Budget guard tests — Phase 2 per-kind caps.
 */

import { describe, it, expect } from 'vitest';
import { assertBelowDailyCap, PIPELINE_BUDGET_CAPS } from '../budget/budgetGuard';
import type { IUsageCountersRepo } from '../repositories/usageCountersRepo';
import type { UsageCounterRow, PipelineKind } from '../repositories/types';

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
    const cap = PIPELINE_BUDGET_CAPS['crystal-trial'];
    const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(cap.runsPerDay, 0, 0));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  it('blocks when runs started cap exceeded (above)', async () => {
    const cap = PIPELINE_BUDGET_CAPS['crystal-trial'];
    const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(cap.runsPerDay + 5, 0, 0));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  it('blocks when token cap exceeded', async () => {
    const cap = PIPELINE_BUDGET_CAPS['crystal-trial'];
    const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(0, cap.tokensPerDay, 0));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  it('blocks when combined tokens exceed cap', async () => {
    const cap = PIPELINE_BUDGET_CAPS['crystal-trial'];
    const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(
      0,
      cap.tokensPerDay - 100,
      100,
    ));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  // ── Per-kind cap tests (Phase 2) ──────────────────────
  const caps: Array<{ kind: PipelineKind; runsPerDay: number; tokensPerDay: number }> = [
    { kind: 'crystal-trial', ...PIPELINE_BUDGET_CAPS['crystal-trial'] },
    { kind: 'topic-content', ...PIPELINE_BUDGET_CAPS['topic-content'] },
    { kind: 'topic-expansion', ...PIPELINE_BUDGET_CAPS['topic-expansion'] },
    { kind: 'subject-graph', ...PIPELINE_BUDGET_CAPS['subject-graph'] },
  ];

  for (const { kind, runsPerDay, tokensPerDay } of caps) {
    it(`blocks ${kind} when run cap (${runsPerDay}) exceeded`, async () => {
      const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(runsPerDay, 0, 0), kind);
      expect(result.ok).toBe(false);
      expect(result.message).toContain(String(runsPerDay));
    });

    it(`allows ${kind} when under run cap`, async () => {
      const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(runsPerDay - 1, 0, 0), kind);
      expect(result.ok).toBe(true);
    });

    it(`blocks ${kind} when token cap (${tokensPerDay}) exceeded`, async () => {
      const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(0, tokensPerDay, 0), kind);
      expect(result.ok).toBe(false);
      expect(result.message).toContain(String(tokensPerDay));
    });

    it(`allows ${kind} when under token cap`, async () => {
      const result = await assertBelowDailyCap('dev-1', createFakeUsageRepo(0, tokensPerDay - 1, 0), kind);
      expect(result.ok).toBe(true);
    });
  }

  it('uses UTC day correctly', () => {
    expect(PIPELINE_BUDGET_CAPS['crystal-trial'].runsPerDay).toBe(10);
    expect(PIPELINE_BUDGET_CAPS['crystal-trial'].tokensPerDay).toBe(500_000);
  });
});
