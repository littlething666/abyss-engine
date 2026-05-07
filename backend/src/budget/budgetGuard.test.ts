import { describe, expect, it } from 'vitest';
import { assertBelowDailyCap, PIPELINE_BUDGET_CAPS } from '../budget/budgetGuard';
import type { PipelineKind } from '../repositories/types';
import { createFakeD1, q, qErr } from '../testStubs/fakeD1';

describe('budgetGuard (D1 conditional reservation)', () => {
  it('allows when the D1 conditional update changes one row', async () => {
    const { db } = createFakeD1([q(null, 1), q(null, 1)]);
    const result = await assertBelowDailyCap('dev-1', db);
    expect(result.ok).toBe(true);
  });

  it('blocks when the D1 conditional update changes no rows', async () => {
    const { db } = createFakeD1([q(null, 1), q(null, 0)]);
    const result = await assertBelowDailyCap('dev-1', db);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  it('fails closed when D1 throws', async () => {
    const { db } = createFakeD1([qErr('D1 unavailable')]);
    const result = await assertBelowDailyCap('dev-1', db);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  for (const [kind, caps] of Object.entries(PIPELINE_BUDGET_CAPS)) {
    it(`passes ${kind} caps to the D1 reservation statement`, async () => {
      const { db, calls } = createFakeD1([q(null, 1), q(null, 1)]);
      await assertBelowDailyCap('dev-1', db, kind as PipelineKind);
      expect(calls[1].args).toEqual(expect.arrayContaining([caps.runsPerDay, caps.tokensPerDay]));
    });
  }

  it('uses UTC day in D1 usage counter keys', async () => {
    const { db, calls } = createFakeD1([q(null, 1), q(null, 1)]);
    await assertBelowDailyCap('dev-1', db);
    expect(calls[0].args[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calls[0].args[1]).toBe(new Date().toISOString().slice(0, 10));
  });
});
