/**
 * Run routes — POST /v1/runs, GET /v1/runs, GET /v1/runs/:id,
 * POST /v1/runs/:id/cancel, POST /v1/runs/:id/retry.
 *
 * Phase 2: expanded to cover all four pipeline kinds with per-kind budget
 * caps, supersession for topic-expansion, and cache-hit short-circuit across
 * all kinds. Workflow creation is stubbed for topic-content, topic-expansion,
 * and subject-graph (Workflow classes land in PR-2B / 2C / 2D).
 */

import { Hono } from 'hono';
import { makeRepos } from '../repositories';
import { assertBelowDailyCap } from '../budget/budgetGuard';
import { utcDay } from '../repositories/usageCountersRepo';
import type { Env } from '../env';
import type { PipelineKind, CancelReason } from '../repositories/types';
import type { RunInputSnapshot, SubmitRunBody } from '../types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lightweight snapshot assertion. Full Zod validation lands in PR-D when
 * @contracts is wired. Accepts any of the four pipeline kinds.
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
  // subject_id is always required; topic_id is required except for subject-graph
  if (!s.pipeline_kind || !s.schema_version || !s.subject_id) {
    return { kind: b.kind, snapshot: {} as RunInputSnapshot, error: 'snapshot missing required fields (pipeline_kind, schema_version, subject_id)' };
  }

  return { kind: b.kind, snapshot: s as unknown as RunInputSnapshot };
}

/** Extract the supersedes key from request headers. */
function getSupersedesKey(req: Request): string | undefined {
  const val = req.headers.get('Supersedes-Key');
  if (!val || val.trim() === '') return undefined;
  return val.trim();
}

/**
 * Compute a deterministic input hash for the snapshot.
 * TODO(PR-D): replace with @contracts canonicalHash.inputHash(snapshot).
 */
async function computeInputHash(snapshot: RunInputSnapshot): Promise<string> {
  const json = JSON.stringify(snapshot, Object.keys(snapshot).sort());
  const data = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return `inp_${Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

function today(): string {
  return utcDay(new Date());
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const runs = new Hono<{ Bindings: Env; Variables: { deviceId: string; idempotencyKey?: string } }>();

/**
 * POST /v1/runs — submit a new run.
 *
 * Headers: X-Abyss-Device, Idempotency-Key, [Supersedes-Key],
 *          Content-Type: application/json
 * Body: { kind: PipelineKind, snapshot: { ... } }
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

  // 3. Per-kind budget guard.
  const budget = await assertBelowDailyCap(deviceId, repos.usage, kind);
  if (!budget.ok) {
    return c.json({ code: budget.code, message: budget.message }, 429);
  }

  // 4. Compute input hash.
  const inputHash = await computeInputHash(snapshot);

  // 5. Cache-hit short-circuit.
  const cached = await repos.artifacts.findCacheHit(deviceId, kind, inputHash);

  if (cached) {
    const run = await repos.runs.insertRun({
      id: crypto.randomUUID(),
      device_id: deviceId,
      kind,
      status: 'ready',
      input_hash: inputHash,
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

    await repos.runs.append(run.id, deviceId, 'run.artifact-ready', {
      artifactId: cached.id,
      contentHash: cached.content_hash,
      fromCache: true,
    });
    await repos.runs.append(run.id, deviceId, 'run.completed', { fromCache: true });

    try {
      await repos.usage.incrementRunsStarted(deviceId, today());
    } catch { /* non-critical */ }

    return c.json({ runId: run.id }, 201);
  }

  // 6. Cache miss — handle supersession for topic-expansion.
  let supersededRunId: string | null = null;
  if (supersedesKey && kind === 'topic-expansion') {
    supersededRunId = await repos.runs.cancelSupersededRun(deviceId, supersedesKey);
  }

  // 7. Create a queued run.
  const run = await repos.runs.insertRun({
    id: crypto.randomUUID(),
    device_id: deviceId,
    kind,
    status: 'queued',
    input_hash: inputHash,
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

  await repos.runs.append(run.id, deviceId, 'run.queued', {});

  // Emit cancel-acknowledged + cancelled for the superseded run.
  if (supersededRunId) {
    await repos.runs.append(supersededRunId, deviceId, 'run.cancel-acknowledged', { reason: 'superseded' });
    await repos.runs.markCancelled(supersededRunId);
    await repos.runs.append(supersededRunId, deviceId, 'run.cancelled', { boundary: 'supersession', reason: 'superseded' });
  }

  try {
    await repos.usage.incrementRunsStarted(deviceId, today());
  } catch { /* non-critical */ }

  // TODO(PR-2B/2C/2D): create the appropriate Workflow class here.
  // For now, topic-content / topic-expansion / subject-graph are stubbed
  // and stay in 'queued' status.
  const workflowKind = kind === 'crystal-trial' ? 'CrystalTrialWorkflow' : `${kind} (stubbed)`;
  console.log(`[runs] run ${run.id} queued (kind=${kind}, workflow=${workflowKind})`);

  // Phase 2: dispatch to the appropriate Workflow binding.
  // Each binding creates the Workflow class asynchronously.
  try {
    switch (kind) {
      case 'crystal-trial':
        await c.env.CRYSTAL_TRIAL_WORKFLOW.create({
          id: run.id,
          params: { runId: run.id, deviceId },
        });
        break;
      case 'topic-expansion':
        await c.env.TOPIC_EXPANSION_WORKFLOW.create({
          id: run.id,
          params: { runId: run.id, deviceId },
        });
        break;
      case 'subject-graph':
        await c.env.SUBJECT_GRAPH_WORKFLOW.create({
          id: run.id,
          params: { runId: run.id, deviceId },
        });
        break;
      case 'topic-content':
        await c.env.TOPIC_CONTENT_WORKFLOW.create({
          id: run.id,
          params: { runId: run.id, deviceId },
        });
        break;
    }
  } catch (err) {
    console.error(`[runs] failed to create workflow for run ${run.id}:`, err);
    // The run stays in 'queued' status; the workflow engine will retry.
  }

  return c.json({ runId: run.id }, 201);
});

/**
 * GET /v1/runs — list runs for the authenticated device.
 * Query: ?status=active|recent|all&kind=&subjectId=&topicId=&limit=
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
  return c.json({ runs: rows });
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

  return c.json({ ...run, events });
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
    return c.json({ error: 'run_already_terminal', status: run.status }, 409);
  }

  const written = await repos.runs.requestCancel(runId, 'user');

  if (!written) {
    return c.json({ status: run.status, message: 'run already terminal' });
  }

  await repos.runs.append(runId, deviceId, 'run.cancel-acknowledged', { reason: 'user' });

  return c.json({ status: 'cancel_acknowledged' });
});

/**
 * POST /v1/runs/:id/retry — retry a terminal run.
 */
runs.post('/:id/retry', async (c) => {
  const deviceId = c.get('deviceId');
  const runId = c.req.param('id');
  const repos = makeRepos(c.env);

  const run = await repos.runs.load(runId);
  if (run.device_id !== deviceId) {
    return c.json({ error: 'not_found' }, 404);
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

  await repos.runs.append(newRunId, deviceId, 'run.queued', { retry_of: runId });

  try {
    await repos.usage.incrementRunsStarted(deviceId, today());
  } catch { /* non-critical */ }

  // Dispatch to the appropriate Workflow.
  try {
    switch (run.kind) {
      case 'crystal-trial':
        await c.env.CRYSTAL_TRIAL_WORKFLOW.create({ id: newRunId, params: { runId: newRunId, deviceId } });
        break;
      case 'topic-expansion':
        await c.env.TOPIC_EXPANSION_WORKFLOW.create({ id: newRunId, params: { runId: newRunId, deviceId } });
        break;
      case 'subject-graph':
        await c.env.SUBJECT_GRAPH_WORKFLOW.create({ id: newRunId, params: { runId: newRunId, deviceId } });
        break;
      case 'topic-content':
        await c.env.TOPIC_CONTENT_WORKFLOW.create({ id: newRunId, params: { runId: newRunId, deviceId } });
        break;
    }
  } catch (err) {
    console.error(`[runs] failed to create workflow for retry run ${newRunId}:`, err);
  }
});

export { runs };
