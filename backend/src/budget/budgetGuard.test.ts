/**
 * Budget guard tests — Phase 3.5 atomic RPC-based reservation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { assertBelowDailyCap, PIPELINE_BUDGET_CAPS } from '../budget/budgetGuard';
import type { PipelineKind } from '../repositories/types';

// Minimal Supabase client mock — only needs `rpc`.
function createFakeDb(rpcResult: { ok: boolean; code?: string; message?: string } | null) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult ? { data: rpcResult, error: null } : { data: null, error: new Error('RPC not deployed') }),
  } as unknown as Parameters<typeof assertBelowDailyCap>[1];
}

describe('budgetGuard (Phase 3.5 atomic)', () => {
  it('allows when RPC returns ok: true', async () => {
    const db = createFakeDb({ ok: true });
    const result = await assertBelowDailyCap('dev-1', db);
    expect(result.ok).toBe(true);
    expect(db.rpc).toHaveBeenCalledWith('reserve_run_budget', expect.objectContaining({
      p_device_id: 'dev-1',
      p_run_cap: PIPELINE_BUDGET_CAPS['crystal-trial'].runsPerDay,
      p_token_cap: PIPELINE_BUDGET_CAPS['crystal-trial'].tokensPerDay,
    }));
  });

  it('blocks when RPC returns ok: false', async () => {
    const db = createFakeDb({ ok: false, code: 'budget:over-cap', message: 'daily run cap (10) exceeded' });
    const result = await assertBelowDailyCap('dev-1', db);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
  });

  it('fails closed when RPC is not deployed (error)', async () => {
    const db = createFakeDb(null);
    const result = await assertBelowDailyCap('dev-1', db);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('budget:over-cap');
    expect(result.message).toContain('unavailable');
  });

  // ── Per-kind cap RPC parameters ──────────────────────
  for (const [kind, caps] of Object.entries(PIPELINE_BUDGET_CAPS)) {
    it(`passes ${kind} caps to RPC`, async () => {
      const db = createFakeDb({ ok: true });
      await assertBelowDailyCap('dev-1', db, kind as PipelineKind);
      expect(db.rpc).toHaveBeenCalledWith('reserve_run_budget', expect.objectContaining({
        p_run_cap: caps.runsPerDay,
        p_token_cap: caps.tokensPerDay,
      }));
    });
  }

  it('uses UTC day in RPC call', async () => {
    const db = createFakeDb({ ok: true });
    await assertBelowDailyCap('dev-1', db);
    const calls = (db.rpc as ReturnType<typeof vi.fn>).mock.calls;
    const p_day: string = calls[0][1].p_day;
    expect(p_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Must match today's UTC date.
    const today = new Date().toISOString().slice(0, 10);
    expect(p_day).toBe(today);
  });
});
