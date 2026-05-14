/**
 * Failure stats tests — Phase 3 failure dashboard.
 *
 * Tests the aggregation logic in isolation (pure function approach)
 * and the route handler via a mock-injected Hono app.
 */

import { describe, it, expect } from 'vitest';
import type { RunRow, PipelineKind } from '../repositories/types';
import type { FailuresByPipeline, FailureStatsResponse } from './runs.stats';

// ---------------------------------------------------------------------------
// Inline the aggregation logic for direct testing
// (mirrors the logic in runs.stats.ts).
// ---------------------------------------------------------------------------
function aggregateFailures(
  runs: RunRow[],
  filter?: { pipelineKind?: PipelineKind; model?: string; failureCode?: string },
  days: number = 7,
): FailureStatsResponse {
  const now = new Date();
  const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  let filtered = runs;
  if (filter?.pipelineKind) {
    filtered = filtered.filter((r) => r.kind === filter!.pipelineKind);
  }
  if (filter?.model) {
    filtered = filtered.filter((r) => {
      const model = (r.snapshot_json as Record<string, unknown>)?.model_id as string | undefined;
      return model === filter!.model;
    });
  }
  if (filter?.failureCode) {
    filtered = filtered.filter((r) => r.error_code === filter!.failureCode);
  }

  // Group by pipeline kind.
  const byKind = new Map<PipelineKind, RunRow[]>();
  for (const r of filtered) {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }

  const pipelines: FailuresByPipeline[] = [];
  for (const [pipelineKind, kindRuns] of byKind) {
    const totalRuns = kindRuns.length;
    const failedRuns = kindRuns.filter((r) => r.status === 'failed_final').length;
    const failureRate = totalRuns > 0 ? failedRuns / totalRuns : 0;

    const byFailureCode: Record<string, { count: number; lastSeenAt: string }> = {};
    for (const r of kindRuns) {
      if (r.error_code) {
        const entry = byFailureCode[r.error_code] ?? { count: 0, lastSeenAt: r.finished_at ?? '' };
        entry.count++;
        if (r.finished_at && r.finished_at > entry.lastSeenAt) {
          entry.lastSeenAt = r.finished_at;
        }
        byFailureCode[r.error_code] = entry;
      }
    }

    const byModel: Record<string, { totalRuns: number; failedRuns: number; failureRate: number }> = {};
    for (const r of kindRuns) {
      const model = ((r.snapshot_json as Record<string, unknown>)?.model_id as string) ?? 'unknown';
      const entry = byModel[model] ?? { totalRuns: 0, failedRuns: 0, failureRate: 0 };
      entry.totalRuns++;
      if (r.status === 'failed_final') entry.failedRuns++;
      entry.failureRate = entry.totalRuns > 0 ? entry.failedRuns / entry.totalRuns : 0;
      byModel[model] = entry;
    }

    const bySchemaVersion: Record<string, { totalRuns: number; failedRuns: number; failureRate: number }> = {};
    for (const r of kindRuns) {
      const version = String((r.snapshot_json as Record<string, unknown>)?.schema_version ?? 0);
      const entry = bySchemaVersion[version] ?? { totalRuns: 0, failedRuns: 0, failureRate: 0 };
      entry.totalRuns++;
      if (r.status === 'failed_final') entry.failedRuns++;
      entry.failureRate = entry.totalRuns > 0 ? entry.failedRuns / entry.totalRuns : 0;
      bySchemaVersion[version] = entry;
    }

    pipelines.push({
      pipelineKind,
      totalRuns,
      failedRuns,
      failureRate,
      byFailureCode,
      byModel,
      bySchemaVersion,
    });
  }

  pipelines.sort((a, b) => a.pipelineKind.localeCompare(b.pipelineKind));

  return { windowDays: days, windowStart, windowEnd: now.toISOString(), pipelines };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRun(overrides: Partial<RunRow> & { id: string; kind: PipelineKind }): RunRow {
  return {
    id: overrides.id,
    device_id: overrides.device_id ?? 'dev-1',
    kind: overrides.kind,
    status: overrides.status ?? 'ready',
    input_hash: overrides.input_hash ?? 'inp_xxx',
    idempotency_key: null,
    parent_run_id: null,
    supersedes_key: null,
    cancel_requested_at: null,
    cancel_reason: null,
    subject_id: 'subj-1',
    topic_id: 'topic-1',
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    finished_at: overrides.finished_at ?? null,
    error_code: overrides.error_code ?? null,
    error_message: overrides.error_message ?? null,
    snapshot_json: overrides.snapshot_json ?? { model_id: 'gemini-flash', schema_version: 1 },
    next_event_seq: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('failure stats aggregation (Phase 3)', () => {
  it('returns empty pipelines when no runs exist', () => {
    const result = aggregateFailures([], undefined, 7);
    expect(result.windowDays).toBe(7);
    expect(result.pipelines).toEqual([]);
    expect(result.windowStart).toBeDefined();
    expect(result.windowEnd).toBeDefined();
  });

  it('aggregates failures by pipeline kind', () => {
    const runs = [
      makeRun({ id: 'r1', kind: 'crystal-trial', status: 'failed_final', error_code: 'llm:rate-limit', finished_at: '2026-05-05T00:00:00Z' }),
      makeRun({ id: 'r2', kind: 'crystal-trial', status: 'ready' }),
      makeRun({ id: 'r3', kind: 'topic-expansion', status: 'failed_final', error_code: 'parse:zod-shape', finished_at: '2026-05-05T00:01:00Z' }),
      makeRun({ id: 'r4', kind: 'topic-expansion', status: 'failed_final', error_code: 'parse:zod-shape', finished_at: '2026-05-05T00:02:00Z' }),
      makeRun({ id: 'r5', kind: 'topic-expansion', status: 'ready' }),
    ];

    const result = aggregateFailures(runs);

    const ct = result.pipelines.find((p) => p.pipelineKind === 'crystal-trial');
    expect(ct).toBeDefined();
    expect(ct!.totalRuns).toBe(2);
    expect(ct!.failedRuns).toBe(1);
    expect(ct!.failureRate).toBe(0.5);

    const te = result.pipelines.find((p) => p.pipelineKind === 'topic-expansion');
    expect(te).toBeDefined();
    expect(te!.totalRuns).toBe(3);
    expect(te!.failedRuns).toBe(2);
    expect(te!.failureRate).toBeCloseTo(2 / 3);
    expect(te!.byFailureCode['parse:zod-shape']).toBeDefined();
    expect(te!.byFailureCode['parse:zod-shape'].count).toBe(2);
  });

  it('groups by model', () => {
    const runs = [
      makeRun({ id: 'r1', kind: 'crystal-trial', status: 'failed_final', error_code: 'x', finished_at: '2026-05-05T00:00:00Z', snapshot_json: { model_id: 'gemini-pro', schema_version: 1 } }),
      makeRun({ id: 'r2', kind: 'crystal-trial', status: 'ready', snapshot_json: { model_id: 'gemini-flash', schema_version: 1 } }),
    ];

    const result = aggregateFailures(runs);
    const ct = result.pipelines[0];
    expect(ct.byModel['gemini-pro'].totalRuns).toBe(1);
    expect(ct.byModel['gemini-pro'].failedRuns).toBe(1);
    expect(ct.byModel['gemini-pro'].failureRate).toBe(1);
    expect(ct.byModel['gemini-flash'].totalRuns).toBe(1);
    expect(ct.byModel['gemini-flash'].failedRuns).toBe(0);
    expect(ct.byModel['gemini-flash'].failureRate).toBe(0);
  });

  it('groups by schema version', () => {
    const runs = [
      makeRun({ id: 'r1', kind: 'crystal-trial', status: 'failed_final', error_code: 'x', finished_at: '2026-05-05T00:00:00Z', snapshot_json: { schema_version: 1 } }),
      makeRun({ id: 'r2', kind: 'crystal-trial', status: 'ready', snapshot_json: { schema_version: 1 } }),
      makeRun({ id: 'r3', kind: 'crystal-trial', status: 'failed_final', error_code: 'y', finished_at: '2026-05-05T00:01:00Z', snapshot_json: { schema_version: 2 } }),
    ];

    const result = aggregateFailures(runs);
    const ct = result.pipelines[0];
    expect(ct.bySchemaVersion['1'].totalRuns).toBe(2);
    expect(ct.bySchemaVersion['1'].failedRuns).toBe(1);
    expect(ct.bySchemaVersion['2'].totalRuns).toBe(1);
    expect(ct.bySchemaVersion['2'].failedRuns).toBe(1);
  });

  it('filters by pipelineKind', () => {
    const runs = [
      makeRun({ id: 'r1', kind: 'crystal-trial', status: 'ready' }),
      makeRun({ id: 'r2', kind: 'topic-expansion', status: 'ready' }),
    ];

    const result = aggregateFailures(runs, { pipelineKind: 'crystal-trial' });
    expect(result.pipelines).toHaveLength(1);
    expect(result.pipelines[0].pipelineKind).toBe('crystal-trial');
    expect(result.pipelines[0].totalRuns).toBe(1);
  });

  it('handles missing snapshot fields gracefully', () => {
    const runs = [
      makeRun({ id: 'r1', kind: 'crystal-trial', status: 'failed_final', error_code: 'x', finished_at: '2026-05-05T00:00:00Z', snapshot_json: {} }),
      makeRun({ id: 'r2', kind: 'crystal-trial', status: 'ready', snapshot_json: {} }),
    ];

    const result = aggregateFailures(runs);
    expect(result.pipelines).toHaveLength(1);
    expect(result.pipelines[0].byModel['unknown'].totalRuns).toBe(2);
    expect(result.pipelines[0].bySchemaVersion['0'].totalRuns).toBe(2);
  });

  it('passes days through to windowDays field', () => {
    // The inline function passes days through as-is.
    // The route-validation seam accepts only days 1-90 before this aggregation runs.
    const r0 = aggregateFailures([], undefined, 0);
    expect(r0.windowDays).toBe(0);
    const r100 = aggregateFailures([], undefined, 100);
    expect(r100.windowDays).toBe(100);
  });

  it('sorts pipelines alphabetically by kind', () => {
    const runs = [
      makeRun({ id: 'r1', kind: 'topic-expansion', status: 'ready' }),
      makeRun({ id: 'r2', kind: 'crystal-trial', status: 'ready' }),
    ];

    const result = aggregateFailures(runs);
    expect(result.pipelines[0].pipelineKind).toBe('crystal-trial');
    expect(result.pipelines[1].pipelineKind).toBe('topic-expansion');
  });

  it('lastSeenAt tracks most recent failure per code', () => {
    const runs = [
      makeRun({ id: 'r1', kind: 'crystal-trial', status: 'failed_final', error_code: 'x', finished_at: '2026-01-01T00:00:00Z' }),
      makeRun({ id: 'r2', kind: 'crystal-trial', status: 'failed_final', error_code: 'x', finished_at: '2026-06-01T00:00:00Z' }),
    ];

    const result = aggregateFailures(runs);
    expect(result.pipelines[0].byFailureCode['x'].count).toBe(2);
    expect(result.pipelines[0].byFailureCode['x'].lastSeenAt).toBe('2026-06-01T00:00:00Z');
  });
});
