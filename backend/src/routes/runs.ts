/**
 * Run routes — POST /v1/runs, GET /v1/runs, GET /v1/runs/:id,
 * POST /v1/runs/:id/cancel, POST /v1/runs/:id/retry.
 *
 * Phase 3.6: Single budget reservation owner, typed events, transport
 * statuses, idempotency-records-based 24h TTL, and proper retry contract.
 */

import { Hono } from 'hono';
import { makeRepos } from '../repositories';
import { assertBelowDailyCap } from '../budget/budgetGuard';
import { inputHash } from '../contracts/generationContracts';
import {
  buildRunQueuedEvent,
  buildRunStatusEvent,
  buildArtifactReadyEvent,
  buildRunCompletedEvent,
  buildRunFailedEvent,
  buildRunCancelledEvent,
  buildRunCancelAcknowledgedEvent,
} from '../contracts/typedEvents';
import { dbStatusToTransport } from './statusMapper';
import type { Env } from '../env';
import type { PipelineKind } from '../repositories/types';
import type { RunInputSnapshot, SubmitRunBody } from '../types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lightweight snapshot assertion. Full Zod validation is deferred — the
 * contracts module's strict parsers validate inside Workflows.
 */
function assertSnapshot(body: unknown): {
  kind: PipelineKind;
  snapshot: RunInputSnapshot;
  error?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { kind: 'crystal-trial', snapshot: {} as RunInputSnapshot, error: 'invalid_body' };
  }

  const b = body as SubmitRunBody & { supersedesKey?: string };

  const VALID_KINDS: PipelineKind[] = [
    'crystal-trial',
    'topic-content',
    'topic-expansion',
    'subject-graph',
  ];

  if (!VALID_KINDS.includes(b.kind)) {
    return { kind: 'crystal-trial', snapshot: {} as RunInputSnapshot, error: `unsupported kind: ${String(b.kind)}` };
  }

  const snapshot = b.snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { kind: b.kind, snapshot: {} as RunInputSnapshot, error: 'missing or invalid snapshot' };
  }

  const s = snapshot as Record<string, unknown>;
  if (!s.pipeline_kind || !s.schema_version || !s.subject_id) {
    return { kind: b.kind, snapshot: {} as RunInputSnapshot, error: 'snapshot missing required fields (pipeline_kind, schema_version, subject_id)' };
  }

  return { kind: b.kind, snapshot: s as unknown as RunInputSnapshot };
}

function getSupersedesKey(req: Request): string | undefined {
  const val = req.headers.get('Supersedes-Key');
  if (!val || val.trim() === '') return undefined;
  return val.trim();
}

function cacheArtifactKind(kind: PipelineKind): string {
  switch (kind) {
    case 'crystal-trial': return 'crystal-trial';
    case 'topic-expansion': return 'topic-expansion-cards';
    case 'subject-graph': return 'subject-graph-topics';
    case 'topic-content': return 'topic-theory';
  }
}

/**
 * Dispatch a run to the correct Cloudflare Workflow.
 * Returns `{ ok: true }` on success, `{ ok: false, error }` on failure.
 */
async function dispatchWorkflow(
  kind: PipelineKind,
  runId: string,
  deviceId: string,
  env: Env,
): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (kind) {
      case 'crystal-trial':
        await env.CRYSTAL_TRIAL_WORKFLOW.create({ id: runId, params: { runId, deviceId } });
        break;
      case 'topic-expansion':
        await env.TOPIC_EXPANSION_WORKFLOW.create({ id: runId, params: { runId, deviceId } });
        break;
      case 'subject-graph':
        await env.SUBJECT_GRAPH_WORKFLOW.create({ id: runId, params: { runId, deviceId } });
        break;
      case 'topic-content':
        await env.TOPIC_CONTENT_WORKFLOW.create({ id: runId, params: { runId, deviceId } });
        break;
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[runs] failed to create workflow for run ${runId} (kind=${kind}):`, err);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const runs = new Hono<{ Bindings: Env; Variables: { deviceId: string; idempotencyKey?: string } }>();

/**
 * POST /v1/runs — submit a new run.
 *
 * Budget is reserved exactly once here (Phase 3.6 Step 4). Workflows
 * do NOT call `assertBelowDailyCap` — they only check cancellation,
 * cache, and tokens.
 */
runs.post('/', async (c) => {
  const deviceId = c.get('deviceId');
  const idempotencyKey = c.get('idempotencyKey');
  const repos = makeRepos(c.env);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json_body' }, 400);
  }

  // 1. Validate snapshot + extract kind.
  const { kind, snapshot, error: snapErr } = assertSnapshot(body);
  if (snapErr) {
    return c.json({ code: 'parse:json-mode-violation', message: snapErr }, 400);
  }

  // 2. Supersedes-Key is only valid for topic-expansion.
  const supersedesKey = getSupersedesKey(c.req.raw);
  if (supersedesKey && kind !== 'topic-expansion') {
    return c.json({ code: 'config:unexpected-supersedes-key', message: 'Supersedes-Key is only valid for kind=topic-expansion' }, 400);
  }

  // 3. Atomic budget reservation — SINGLE OWNER (Phase 3.6 Step 4).
  const budget = await assertBelowDailyCap(deviceId, repos.db, kind);
  if (!budget.ok) {
    return c.json({ code: budget.code, message: budget.message }, 429);
  }

  // 5. Compute contract-owned input hash.
  const hash = await inputHash(snapshot);

  // 6. Cache-hit short-circuit.
  const artifactKind = cacheArtifactKind(kind);
  const cached = await repos.artifacts.findCacheHit(deviceId, artifactKind, hash);

  if (cached) {
    const runId = crypto.randomUUID();
    const run = await repos.runs.insertRun({
      id: runId,
      device_id: deviceId,
      kind,
      status: 'ready',
      input_hash: hash,
      idempotency_key: idempotencyKey ?? null,
      parent_run_id: null,
      supersedes_key: supersedesKey ?? null,
      cancel_requested_at: null,
      cancel_reason: null,
      subject_id: (snapshot as Record<string, unknown>).subject_id as string ?? null,
      topic_id: (snapshot as Record<string, unknown>).topic_id as string ?? null,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
      snapshot_json: snapshot as Record<string, unknown>,
    });

    // Update idempotency record to point to the actual run (Phase 3.6 Step 5).
    if (idempotencyKey) {
      await repos.idempotency.record(deviceId, idempotencyKey, runId);
    }

    // Emit typed events (Phase 3.6 Step 6).
    await repos.runs.appendTyped(runId, deviceId,
      buildArtifactReadyEvent({
        artifactId: cached.id,
        kind: cached.kind,
        contentHash: cached.content_hash,
        inputHash: hash,
        schemaVersion: cached.schema_version,
        fromCache: true,
      }),
    );
    await repos.runs.appendTyped(runId, deviceId, buildRunCompletedEvent());

    return c.json({ runId: run.id }, 201);
  }

  // 7. Cache miss — handle supersession for topic-expansion.
  let supersededRunId: string | null = null;
  if (supersedesKey && kind === 'topic-expansion') {
    supersededRunId = await repos.runs.cancelSupersededRun(deviceId, supersedesKey);
  }

  // 8. Create a queued run.
  const run = await repos.runs.insertRun({
    id: crypto.randomUUID(),
    device_id: deviceId,
    kind,
    status: 'queued',
    input_hash: hash,
    idempotency_key: idempotencyKey ?? null,
    parent_run_id: null,
    supersedes_key: supersedesKey ?? null,
    cancel_requested_at: null,
    cancel_reason: null,
    subject_id: (snapshot as Record<string, unknown>).subject_id as string ?? null,
    topic_id: (snapshot as Record<string, unknown>).topic_id as string ?? null,
    started_at: null,
    finished_at: null,
    error_code: null,
    error_message: null,
    snapshot_json: snapshot as Record<string, unknown>,
  });

  // Update idempotency record to point to the actual run (Phase 3.6 Step 5).
  if (idempotencyKey) {
    await repos.idempotency.record(deviceId, idempotencyKey, run.id);
  }

  // Emit typed events (Phase 3.6 Step 6).
  await repos.runs.appendTyped(run.id, deviceId, buildRunQueuedEvent());

  // Emit cancel-acknowledged + cancelled for the superseded run.
  if (supersededRunId) {
    await repos.runs.appendTyped(supersededRunId, deviceId,
      buildRunCancelAcknowledgedEvent('superseded'),
    );
    await repos.runs.markCancelled(supersededRunId);
    await repos.runs.appendTyped(supersededRunId, deviceId,
      buildRunCancelledEvent('supersession', 'superseded'),
    );
  }

  // 9. Durable enqueue — dispatch failure is terminal (Phase 3.6 Step 3 contract).
  const dispatch = await dispatchWorkflow(kind, run.id, deviceId, c.env);
  if (!dispatch.ok) {
    await repos.runs.markFailed(run.id, 'config:invalid', `Workflow dispatch failed: ${dispatch.error}`);
    await repos.runs.appendTyped(run.id, deviceId,
      buildRunFailedEvent('config:invalid', `Workflow dispatch failed: ${dispatch.error}`),
    );
    return c.json({
      runId: run.id,
      error: 'workflow_dispatch_failed',
      message: dispatch.error,
    }, 502);
  }

  return c.json({ runId: run.id }, 201);
});

/**
 * GET /v1/runs — list runs for the authenticated device.
 *
 * Phase 3.6 Step 2: `?status=active` excludes terminal `ready` runs.
 * Only truly in-flight runs (queued → persisting) are returned.
 */
runs.get('/', async (c) => {
  const deviceId = c.get('deviceId');
  const repos = makeRepos(c.env);

  const status = c.req.query('status') as string | undefined;
  const kind = c.req.query('kind') as string | undefined;
  const subjectId = c.req.query('subjectId') as string | undefined;
  const topicId = c.req.query('topicId') as string | undefined;
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;

  const rows = await repos.runs.listByDevice(deviceId, { status, kind, subjectId, topicId, limit });

  // Map DB statuses to transport statuses in the response (Phase 3.6 Step 7).
  const mapped = rows.map((r) => ({
    ...r,
    status: dbStatusToTransport(r.status),
  }));

  return c.json({ runs: mapped });
});

/**
 * GET /v1/runs/:id — get a single run with its events.
 */
runs.get('/:id', async (c) => {
  const deviceId = c.get('deviceId');
  const runId = c.req.param('id');
  const repos = makeRepos(c.env);

  const run = await repos.runs.load(runId);
  if (run.device_id !== deviceId) {
    return c.json({ error: 'not_found' }, 404);
  }

  const events = await repos.runs.eventsAfter(runId, deviceId, -1);

  return c.json({
    ...run,
    status: dbStatusToTransport(run.status),
    events,
  });
});

/**
 * POST /v1/runs/:id/cancel — cooperative cancel.
 */
runs.post('/:id/cancel', async (c) => {
  const deviceId = c.get('deviceId');
  const runId = c.req.param('id');
  const repos = makeRepos(c.env);

  const run = await repos.runs.load(runId);
  if (run.device_id !== deviceId) {
    return c.json({ error: 'not_found' }, 404);
  }

  if (run.finished_at) {
    return c.json({ error: 'run_already_terminal', status: dbStatusToTransport(run.status) }, 409);
  }

  const written = await repos.runs.requestCancel(runId, 'user');

  if (!written) {
    return c.json({ status: dbStatusToTransport(run.status), message: 'run already terminal' });
  }

  await repos.runs.appendTyped(runId, deviceId,
    buildRunCancelAcknowledgedEvent('user'),
  );

  return c.json({ status: 'cancel_acknowledged' });
});

/**
 * POST /v1/runs/:id/retry — retry a terminal run.
 *
 * Phase 3.6 Step 3: Follows the same budget reservation, workflow dispatch,
 * enqueue-failure, and event contract as initial submission.
 * Returns `{ runId }` on success. Dispatch failure marks the retry run
 * `failed_final` and returns 502 (no stranded queued runs).
 */
runs.post('/:id/retry', async (c) => {
  const deviceId = c.get('deviceId');
  const runId = c.req.param('id');
  const repos = makeRepos(c.env);

  // Parse optional { stage?, jobId? } body.
  let retryOpts: { stage?: string; jobId?: string } = {};
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const b = body as Record<string, unknown>;
      if (typeof b.stage === 'string') retryOpts.stage = b.stage;
      if (typeof b.jobId === 'string') retryOpts.jobId = b.jobId;
    }
  } catch {
    // No body or invalid JSON — proceed with empty opts.
  }

  const run = await repos.runs.load(runId);
  if (run.device_id !== deviceId) {
    return c.json({ error: 'not_found' }, 404);
  }

  // Phase 3.6 Step 4: Budget reservation for retry (single owner).
  const budget = await assertBelowDailyCap(
    deviceId,
    repos.db,
    run.kind as PipelineKind,
  );
  if (!budget.ok) {
    return c.json({ code: budget.code, message: budget.message }, 429);
  }

  const newRunId = crypto.randomUUID();
  await repos.runs.insertRun({
    id: newRunId,
    device_id: deviceId,
    kind: run.kind,
    status: 'queued',
    input_hash: run.input_hash,
    idempotency_key: null,
    parent_run_id: runId,
    supersedes_key: null,
    cancel_requested_at: null,
    cancel_reason: null,
    subject_id: run.subject_id,
    topic_id: run.topic_id,
    started_at: null,
    finished_at: null,
    error_code: null,
    error_message: null,
    snapshot_json: run.snapshot_json,
  });

  await repos.runs.appendTyped(newRunId, deviceId,
    buildRunQueuedEvent({ retry_of: runId }),
  );

  // Phase 3.6 Step 3: Dispatch with enqueue-failure handling.
  const dispatch = await dispatchWorkflow(
    run.kind as PipelineKind,
    newRunId,
    deviceId,
    c.env,
  );

  if (!dispatch.ok) {
    await repos.runs.markFailed(newRunId, 'config:invalid', `Workflow dispatch failed: ${dispatch.error}`);
    await repos.runs.appendTyped(newRunId, deviceId,
      buildRunFailedEvent('config:invalid', `Workflow dispatch failed: ${dispatch.error}`),
    );
    return c.json({
      runId: newRunId,
      error: 'workflow_dispatch_failed',
      message: dispatch.error,
    }, 502);
  }

  return c.json({ runId: newRunId }, 201);
});

export { runs };
