/**
 * Failure stats routes — Phase 3 failure dashboard endpoint.
 *
 * GET /v1/runs/stats — aggregate failure rates by pipeline, model,
 * failure code, schema version, and time window. Used by the failure
 * dashboard and CI monitoring.
 *
 * Query params:
 *   - days: number of days to look back (default 7, max 90)
 *   - pipelineKind: filter to a single pipeline kind
 *   - model: filter to a single model
 *   - failureCode: filter to a single failure code
 */

import { Hono } from 'hono';
import { makeRepos } from '../repositories';
import { validateFailureStatsQuery } from './validation';
import type { Env } from '../env';
import type { PipelineKind } from '../repositories/types';

export interface FailuresByPipeline {
  pipelineKind: PipelineKind;
  totalRuns: number;
  failedRuns: number;
  failureRate: number;
  byFailureCode: Record<string, { count: number; lastSeenAt: string }>;
  byModel: Record<string, { totalRuns: number; failedRuns: number; failureRate: number }>;
  bySchemaVersion: Record<string, { totalRuns: number; failedRuns: number; failureRate: number }>;
}

export interface FailureStatsResponse {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  pipelines: FailuresByPipeline[];
}

const stats = new Hono<{ Bindings: Env; Variables: { deviceId: string } }>();

stats.get('/stats', async (c) => {
  const deviceId = c.get('deviceId');
  const query = validateFailureStatsQuery({
    days: c.req.query('days'),
    pipelineKind: c.req.query('pipelineKind'),
    model: c.req.query('model'),
    failureCode: c.req.query('failureCode'),
  });
  if (!query.ok) {
    return c.json(query.failure, 400);
  }
  const {
    days,
    pipelineKind: pipelineFilter,
    model: modelFilter,
    failureCode: codeFilter,
  } = query.value;
  const repos = makeRepos(c.env);

  // Compute the window start.
  const now = new Date();
  const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  // Phase 3.5 Step 7: Stats are per-device in pre-auth v1.
  // `listInWindow` returns all devices; we filter to the requesting device.
  // Operator-wide stats require an explicit admin credential (future).
  const rawRuns = await repos.runs.listInWindow(days);
  const deviceRuns = rawRuns.filter((r) => r.device_id === deviceId);

  // Filter by optional query params.
  let runs = deviceRuns;
  if (pipelineFilter) {
    runs = runs.filter((r) => r.kind === pipelineFilter);
  }
  if (modelFilter) {
    runs = runs.filter((r) => {
      const model = (r.snapshot_json as Record<string, unknown>)?.model_id as string | undefined;
      return model === modelFilter;
    });
  }
  if (codeFilter) {
    runs = runs.filter((r) => r.error_code === codeFilter);
  }

  // Group by pipeline kind.
  const byKind = new Map<PipelineKind, typeof runs>();
  for (const r of runs) {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }

  const pipelines: FailuresByPipeline[] = [];
  for (const [pipelineKind, kindRuns] of byKind) {
    const totalRuns = kindRuns.length;
    const failedRuns = kindRuns.filter((r) => r.status === 'failed_final').length;
    const failureRate = totalRuns > 0 ? failedRuns / totalRuns : 0;

    // By failure code.
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

    // By model.
    const byModel: Record<string, { totalRuns: number; failedRuns: number; failureRate: number }> = {};
    for (const r of kindRuns) {
      const model = ((r.snapshot_json as Record<string, unknown>)?.model_id as string) ?? 'unknown';
      const entry = byModel[model] ?? { totalRuns: 0, failedRuns: 0, failureRate: 0 };
      entry.totalRuns++;
      if (r.status === 'failed_final') entry.failedRuns++;
      entry.failureRate = entry.totalRuns > 0 ? entry.failedRuns / entry.totalRuns : 0;
      byModel[model] = entry;
    }

    // By schema version.
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

  // Sort by pipeline kind for stable output.
  pipelines.sort((a, b) => a.pipelineKind.localeCompare(b.pipelineKind));

  return c.json({
    windowDays: days,
    windowStart,
    windowEnd: now.toISOString(),
    pipelines,
  } satisfies FailureStatsResponse);
});

export { stats };
