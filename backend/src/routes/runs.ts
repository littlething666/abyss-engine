/**
 * Run routes — POST /v1/runs, GET /v1/runs, GET /v1/runs/:id,
 * POST /v1/runs/:id/cancel, POST /v1/runs/:id/retry.
 *
 * Phase 4: Cloudflare D1 owns idempotency, budget, and run metadata.
 * Initial submission accepts backend-expanded intents, not client-built
 * snapshots. Typed events, transport statuses, and retry checkpoint lineage
 * remain repository-mediated.
 */

import { Hono } from 'hono';
import { makeRepos } from '../repositories';
import { assertBelowDailyCap, PIPELINE_BUDGET_CAPS } from '../budget/budgetGuard';
import { inputHash } from '../contracts/generationContracts';
import { expandRunIntent, assertNoForbiddenPolicyFields } from '../runIntents/runIntentExpansion';
import { buildRetryRunSnapshot } from './retryPlanning';
import {
  buildRunQueuedEvent,
  buildArtifactReadyEvent,
  buildRunCompletedEvent,
  buildRunFailedEvent,
  buildRunCancelledEvent,
  buildRunCancelAcknowledgedEvent,
} from '../contracts/typedEvents';
import { dbStatusToTransport } from '../contracts/statusMapper';
import type { Env } from '../env';
import type { PipelineKind } from '../repositories/types';
import type { SubmitRunBody } from '../types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lightweight intent assertion. Snapshot construction is backend-owned: the
 * route accepts only `{ kind, intent }`, then expands the intent through the
 * Learning Content Store and backend Generation Policy.
 */
function assertIntentBody(body: unknown): {
  kind: PipelineKind;
  intent: Record<string, unknown>;
  error?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { kind: 'crystal-trial', intent: {}, error: 'invalid_body' };
  }

  const b = body as SubmitRunBody & { snapshot?: unknown };

  const VALID_KINDS: PipelineKind[] = [
    'crystal-trial',
    'topic-content',
    'topic-expansion',
    'subject-graph',
  ];

  if (!VALID_KINDS.includes(b.kind)) {
    return { kind: 'crystal-trial', intent: {}, error: `unsupported kind: ${String(b.kind)}` };
  }

  if ('snapshot' in b) {
    return { kind: b.kind, intent: {}, error: 'snapshot is not accepted; POST /v1/runs requires { kind, intent }' };
  }

  if (!b.intent || typeof b.intent !== 'object' || Array.isArray(b.intent)) {
    return { kind: b.kind, intent: {}, error: 'missing or invalid intent' };
  }

  return { kind: b.kind, intent: b.intent };
}

function getSupersedesKey(req: Request): string | undefined {
  const val = req.headers.get('Supersedes-Key');
  if (!val || val.trim() === '') return undefined;
  return val.trim();
}

function cacheArtifactKind(kind: PipelineKind, snapshot: Record<string, unknown>): string | null {
  switch (kind) {
    case 'crystal-trial': return 'crystal-trial';
    case 'topic-expansion': return 'topic-expansion-cards';
    case 'subject-graph': return snapshot.pipeline_kind === 'subject-graph-topics' ? 'subject-graph-topics' : null;
    case 'topic-content': {
      if (snapshot.stage === 'full') return null;
      const pipelineKind = snapshot.pipeline_kind;
      return typeof pipelineKind === 'string' ? pipelineKind : null;
    }
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
 * Phase 4: the Worker expands `{ kind, intent }` into a backend-owned
 * snapshot before D1 owns idempotency + budget + run creation through the
 * `runs.atomicSubmitRun` adapter method. Workflow dispatch remains separate
 * because Cloudflare Workflows need the D1 run row to exist first.
 */
runs.post('/', async (c) => {
  const deviceId = c.get('deviceId');
  const idempotencyKey = c.get('idempotencyKey');
  if (!idempotencyKey) {
    return c.json({ error: 'missing_header', message: 'Idempotency-Key header is required' }, 400);
  }
  const repos = makeRepos(c.env);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json_body' }, 400);
  }

  // 1. Validate intent + extract kind. Reject client-owned model/provider
  //    policy at this HTTP boundary before expansion or hashing.
  try {
    assertNoForbiddenPolicyFields(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ code: 'config:forbidden-generation-policy-field', message }, 400);
  }

  const { kind, intent, error: intentErr } = assertIntentBody(body);
  if (intentErr) {
    return c.json({ code: 'parse:json-mode-violation', message: intentErr }, 400);
  }

  // 2. Supersedes-Key is only valid for topic-expansion.
  const supersedesKey = getSupersedesKey(c.req.raw);
  if (supersedesKey && kind !== 'topic-expansion') {
    return c.json({ code: 'config:unexpected-supersedes-key', message: 'Supersedes-Key is only valid for kind=topic-expansion' }, 400);
  }

  // 3. Expand backend-owned snapshot from intent using Learning Content Store
  //    and backend Generation Policy before hashing/storage.
  let expanded;
  try {
    expanded = await expandRunIntent({
      deviceId,
      kind,
      intent,
      learningContent: repos.learningContent,
      now: () => new Date(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ code: 'config:invalid-intent', message }, 400);
  }

  // 4. Compute contract-owned input hash.
  const hash = await inputHash(expanded.snapshot);

  // 5. Check artifact cache BEFORE D1 run creation (so we know whether to mark
  //    the run `ready` or `queued`).
  const artifactKind = cacheArtifactKind(kind, expanded.snapshot);
  const cached = artifactKind
    ? await repos.artifacts.findCacheHit(deviceId, artifactKind, hash)
    : null;

  // 6. Handle supersession BEFORE D1 run creation (best-effort — if it
  //    fails the new run still gets created).
  let supersededRunId: string | null = null;
  if (!cached && supersedesKey && kind === 'topic-expansion') {
    supersededRunId = await repos.runs.cancelSupersededRun(deviceId, supersedesKey);
  }

  // 7. Atomic submit — idempotency + budget + run creation at the D1 boundary.
  const caps = PIPELINE_BUDGET_CAPS[kind];
  const now = new Date().toISOString();
  const snapshotRecord = expanded.snapshot;

  const submit = await repos.runs.atomicSubmitRun({
    deviceId,
    idempotencyKey,
    kind,
    inputHash: hash,
    status: cached ? 'ready' : 'queued',
    supersedesKey: supersedesKey ?? null,
    subjectId: expanded.subjectId,
    topicId: expanded.topicId,
    snapshotJson: snapshotRecord,
    parentRunId: null,
    runCap: caps.runsPerDay,
    tokenCap: caps.tokensPerDay,
    startedAt: cached ? now : null,
    finishedAt: cached ? now : null,
  });

  if (submit.status === 'budget_exceeded') {
    return c.json({ code: submit.code, message: submit.message }, 429);
  }

  // If idempotency hit (serialised race winner), return the winner's runId.
  if (submit.existing) {
    return c.json({ runId: submit.runId }, 200);
  }

  const newRunId = submit.runId;
  if (!newRunId) {
    return c.json({ code: 'config:invalid', message: 'D1 run submission did not return a run id' }, 500);
  }

  // 8. Emit events.
  if (cached) {
    await repos.runs.appendTyped(newRunId, deviceId,
      buildArtifactReadyEvent({
        artifactId: cached.id,
        kind: cached.kind,
        contentHash: cached.content_hash,
        inputHash: hash,
        schemaVersion: cached.schema_version,
        fromCache: true,
      }),
    );
    await repos.runs.appendTyped(newRunId, deviceId, buildRunCompletedEvent());
  } else {
    await repos.runs.appendTyped(newRunId, deviceId, buildRunQueuedEvent());

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

    // 9. Durable enqueue — dispatch failure is terminal.
    const dispatch = await dispatchWorkflow(kind, newRunId, deviceId, c.env);
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
  }

  return c.json({ runId: newRunId }, 201);
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

  // Phase 3.6 Step 3: Build the retry snapshot from retryOpts instead of
  // blindly copying the parent snapshot.
  let retryPlan;
  try {
    retryPlan = buildRetryRunSnapshot(run, retryOpts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ code: 'config:invalid-retry-opts', message }, 400);
  }

  const retrySnapshot = retryPlan.snapshot;
  const retryInputHash = await inputHash(retrySnapshot);

  // Phase 3.6 P0 #1: Retry child runs need parent checkpoint lineage so
  // workflows can skip already-completed stages. Copy every `ready`
  // checkpoint from the parent to the child (re-keying run_id).
  const parentCheckpoints = await repos.stageCheckpoints.byRun(runId);

  const newRunId = crypto.randomUUID();
  await repos.runs.insertRun({
    id: newRunId,
    device_id: deviceId,
    kind: run.kind,
    status: 'queued',
    input_hash: retryInputHash,
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
    snapshot_json: retrySnapshot,
  });

  // Copy every ready parent checkpoint to the child so the workflow
  // naturally skips completed stages via its existing checkpoint queries.
  const readyCheckpoints = parentCheckpoints.filter(
    (ckp) => ckp.status === 'ready' && ckp.artifact_id,
  );
  if (readyCheckpoints.length > 0) {
    await Promise.all(
      readyCheckpoints.map((ckp) =>
        repos.stageCheckpoints.upsert({
          runId: newRunId,
          stage: ckp.stage,
          status: 'ready',
          inputHash: ckp.input_hash,
          attempt: ckp.attempt,
          artifactId: ckp.artifact_id,
          jobId: undefined,
          startedAt: ckp.started_at,
          finishedAt: ckp.finished_at,
        }),
      ),
    );
  }

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
