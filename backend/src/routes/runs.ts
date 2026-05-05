/**
 * Run routes — POST /v1/runs, GET /v1/runs, GET /v1/runs/:id,
 * POST /v1/runs/:id/cancel, POST /v1/runs/:id/retry.
 *
 * Phase 1 PR-C: cache-hit path works fully. Workflow creation is stubbed
 * (returns a synthetic run with status 'queued').
 */

import { Hono } from 'hono';
import { makeRepos } from '../repositories';
import { utcDay } from '../repositories/usageCountersRepo';
import type { Env } from '../env';
import type { RunInputSnapshot } from '../types/api';

// ---------------------------------------------------------------------------
// Minimal budget caps (Phase 1 — plan values).
// ---------------------------------------------------------------------------
const CRYSTAL_TRIAL_DAILY_RUN_CAP = 10;
const CRYSTAL_TRIAL_DAILY_TOKEN_CAP = 500_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lightweight snapshot assertion for Crystal Trial.
 * Full Zod validation lands in PR-D when @contracts is wired.
 */
function assertCrystalTrialSnapshot(body: unknown): { snapshot: RunInputSnapshot; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { snapshot: {} as RunInputSnapshot, error: 'invalid_body' };
  }

  const b = body as Record<string, unknown>;

  if (b.kind !== 'crystal-trial') {
    return { snapshot: {} as RunInputSnapshot, error: `unsupported kind: ${String(b.kind)}` };
  }

  const snapshot = b.snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { snapshot: {} as RunInputSnapshot, error: 'missing or invalid snapshot' };
  }

  const s = snapshot as Record<string, unknown>;
  if (!s.pipeline_kind || !s.schema_version || !s.subject_id || !s.topic_id) {
    return { snapshot: {} as RunInputSnapshot, error: 'snapshot missing required fields' };
  }

  return { snapshot: s as unknown as RunInputSnapshot };
}

async function checkBudget(
  deviceId: string,
  env: Env,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const repos = makeRepos(env);
  const today = utcDay(new Date());
  const counter = await repos.usage.get(deviceId, today);

  if (counter && counter.runs_started >= CRYSTAL_TRIAL_DAILY_RUN_CAP) {
    return { ok: false, code: 'budget:over-cap', message: 'daily run cap exceeded' };
  }

  const estimatedTokens = (counter?.tokens_in ?? 0) + (counter?.tokens_out ?? 0);
  if (estimatedTokens >= CRYSTAL_TRIAL_DAILY_TOKEN_CAP) {
    return { ok: false, code: 'budget:over-cap', message: 'daily token estimate cap exceeded' };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const runs = new Hono<{ Bindings: Env; Variables: { deviceId: string; idempotencyKey?: string } }>();

/**
 * POST /v1/runs — submit a new run.
 *
 * Headers: X-Abyss-Device, Idempotency-Key, Content-Type: application/json
 * Body: { kind: 'crystal-trial', snapshot: { ... } }
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

  // 1. Validate snapshot.
  const { snapshot, error: snapErr } = assertCrystalTrialSnapshot(body);
  if (snapErr) {
    return c.json({ code: 'parse:json-mode-violation', message: snapErr }, 400);
  }

  // 2. Budget guard.
  const budget = await checkBudget(deviceId, c.env);
  if (!budget.ok) {
    return c.json({ code: budget.code, message: budget.message }, 429);
  }

  // 3. Compute input hash (stub — real hash lands in PR-D with @contracts).
  const inputHash = `stub-${crypto.randomUUID().slice(0, 8)}`;

  // 4. Cache-hit short-circuit.
  const cached = await repos.artifacts.findCacheHit(deviceId, 'crystal-trial', inputHash);

  if (cached) {
    // Create a synthetic run referencing the cached artifact.
    const run = await repos.runs.insertRun({
      id: crypto.randomUUID(),
      device_id: deviceId,
      kind: 'crystal-trial',
      status: 'ready',
      input_hash: inputHash,
      idempotency_key: idempotencyKey ?? null,
      parent_run_id: null,
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

    // Emit synthetic events.
    await repos.runs.append(run.id, deviceId, 'run.artifact-ready', {
      artifactId: cached.id,
      contentHash: cached.content_hash,
      fromCache: true,
    });
    await repos.runs.append(run.id, deviceId, 'run.completed', { fromCache: true });

    // Increment run counter (no tokens billed).
    try {
      await repos.usage.incrementRunsStarted(deviceId, today());
    } catch { /* non-critical */ }

    return c.json({ runId: run.id }, 201);
  }

  // 5. Cache miss — create a queued run.
  //    PR-D will wire the Workflow here.
  const run = await repos.runs.insertRun({
    id: crypto.randomUUID(),
    device_id: deviceId,
    kind: 'crystal-trial',
    status: 'queued',
    input_hash: inputHash,
    idempotency_key: idempotencyKey ?? null,
    parent_run_id: null,
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

  try {
    await repos.usage.incrementRunsStarted(deviceId, today());
  } catch { /* non-critical */ }

  // TODO(PR-D): create Workflow here.
  console.log(`[runs] run ${run.id} queued (workflow stubbed — no Workflow binding yet)`);

  return c.json({ runId: run.id }, 201);
});

/**
 * GET /v1/runs — list runs for the authenticated device.
 * Query: ?status=active|recent|all&kind=crystal-trial&subjectId=&topicId=&limit=
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
 * GET /v1/runs/:id — get a single run with its jobs and events.
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

  // Write cancel_requested_at + cancel_reason.
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

  // Create a new run with parent_run_id.
  const newRunId = crypto.randomUUID();
  await repos.runs.insertRun({
    id: newRunId,
    device_id: deviceId,
    kind: run.kind,
    status: 'queued',
    input_hash: run.input_hash,
    idempotency_key: null,
    parent_run_id: runId,
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

  // TODO(PR-D): create Workflow here.

  return c.json({ runId: newRunId }, 201);
});

function today(): string {
  return utcDay(new Date());
}

export { runs };
