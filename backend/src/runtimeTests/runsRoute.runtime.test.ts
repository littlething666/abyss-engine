import { env } from 'cloudflare:workers';
import app from '../index';
import { beforeEach, describe, expect, it } from 'vitest';
import { scalar } from './runtimeAssertions';
import { RUNTIME_DEVICE_ID, seedRuntimeDevice } from './runtimeFixtures';
import { resetRuntimeDb } from './setupRuntimeDb';

function headers(extra: Record<string, string> = {}): Headers {
  const headers = new Headers({
    'x-abyss-device': RUNTIME_DEVICE_ID,
    'content-type': 'application/json',
    ...extra,
  });
  return headers;
}

const subjectGraphTopicsIntent = {
  kind: 'subject-graph',
  intent: {
    subjectId: 'runtime-subject',
    stage: 'topics',
    checklist: {
      topic_name: 'Runtime Algebra',
      study_goal: 'Learn runtime-safe equations',
    },
    strategyBrief: {
      total_tiers: 2,
      topics_per_tier: 2,
      audience_brief: 'Runtime integration learner',
      domain_brief: 'Algebra basics',
      focus_constraints: '',
    },
  },
};

function runtimeEnvWithWorkflow(workflow: { create(input: unknown): Promise<unknown> }): typeof env {
  return {
    ...env,
    SUBJECT_GRAPH_WORKFLOW: workflow,
  } as typeof env;
}

async function seedFailedParentRun(runId: string): Promise<void> {
  const now = new Date().toISOString();
  await env.GENERATION_DB.prepare(`
    insert into runs (
      id, device_id, kind, status, input_hash, idempotency_key, parent_run_id,
      supersedes_key, cancel_requested_at, cancel_reason, subject_id, topic_id,
      created_at, started_at, finished_at, error_code, error_message, snapshot_json
    ) values (?, ?, 'subject-graph', 'failed_final', 'ih_parent_runtime', null, null,
      null, null, null, 'runtime-subject', null, ?, ?, ?, 'validation:test', 'seeded parent failure', ?)
  `).bind(
    runId,
    RUNTIME_DEVICE_ID,
    now,
    now,
    now,
    JSON.stringify({
      pipeline_kind: 'subject-graph-topics',
      subject_id: 'runtime-subject',
      schema_version: 1,
      prompt_template_version: 'v1',
      model_id: 'openrouter/test/model',
      captured_at: now,
    }),
  ).run();
}

describe('runtime Worker run routes', () => {
  beforeEach(async () => {
    await resetRuntimeDb(env.GENERATION_DB);
    await seedRuntimeDevice(env.GENERATION_DB);
  });

  it('POST /v1/runs rejects client snapshots and policy fields before run writes', async () => {
    const response = await app.fetch(new Request('https://runtime.test/v1/runs', {
      method: 'POST',
      headers: headers({ 'idempotency-key': 'idem-runtime-invalid' }),
      body: JSON.stringify({
        kind: 'subject-graph',
        intent: { subjectId: 'runtime-subject', modelId: 'openrouter/bad/model' },
        snapshot: {},
      }),
    }), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'config:forbidden-generation-policy-field',
    });
    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from runs')).toBe(0);
    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from idempotency_records')).toBe(0);
  });

  it('Workflow dispatch failure leaves no orphan queued run', async () => {
    const response = await app.fetch(new Request('https://runtime.test/v1/runs', {
      method: 'POST',
      headers: headers({ 'idempotency-key': 'idem-runtime-dispatch-fail' }),
      body: JSON.stringify(subjectGraphTopicsIntent),
    }), runtimeEnvWithWorkflow({
      async create() {
        throw new Error('runtime dispatch boom');
      },
    }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: 'workflow_dispatch_failed',
      message: 'runtime dispatch boom',
    });
    expect(await scalar(env.GENERATION_DB, "select count(*) as value from runs where status = 'queued'"))
      .toBe(0);
    expect(await scalar(env.GENERATION_DB, "select count(*) as value from runs where status = 'failed_final'"))
      .toBe(1);
    expect(await scalar(env.GENERATION_DB, "select count(*) as value from events where type = 'run.failed'"))
      .toBe(1);
  });

  it('POST /v1/runs/:id/cancel after ready leaves the terminal ready run unchanged', async () => {
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.GENERATION_DB.prepare(`
      insert into runs (
        id, device_id, kind, status, input_hash, idempotency_key, parent_run_id,
        supersedes_key, cancel_requested_at, cancel_reason, subject_id, topic_id,
        created_at, started_at, finished_at, error_code, error_message, snapshot_json
      ) values (?, ?, 'crystal-trial', 'ready', 'ih_ready_runtime', null, null,
        null, null, null, 'runtime-subject', 'runtime-topic', ?, ?, ?, null, null, ?)
    `).bind(
      runId,
      RUNTIME_DEVICE_ID,
      now,
      now,
      now,
      JSON.stringify({ pipeline_kind: 'crystal-trial', subject_id: 'runtime-subject', topic_id: 'runtime-topic' }),
    ).run();

    const response = await app.fetch(new Request(`https://runtime.test/v1/runs/${runId}/cancel`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ reason: 'user' }),
    }), env);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'run_already_terminal', status: 'ready' });
    const row = await env.GENERATION_DB.prepare(
      'select status, cancel_requested_at, cancel_reason, finished_at from runs where id = ?',
    ).bind(runId).first<{ status: string; cancel_requested_at: string | null; cancel_reason: string | null; finished_at: string | null }>();
    expect(row?.status).toBe('ready');
    expect(row?.cancel_requested_at).toBeNull();
    expect(row?.cancel_reason).toBeNull();
    expect(row?.finished_at).toBe(now);
    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from events where run_id = ?', runId)).toBe(0);
  });

  it('POST /v1/runs/:id/retry creates a child run with parent lineage', async () => {
    const parentRunId = crypto.randomUUID();
    await seedFailedParentRun(parentRunId);

    const response = await app.fetch(new Request(`https://runtime.test/v1/runs/${parentRunId}/retry`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    }), runtimeEnvWithWorkflow({
      async create() {
        return { id: 'runtime-workflow-instance' };
      },
    }));

    expect(response.status).toBe(201);
    const body = await response.json() as { runId: string };
    expect(body.runId).toBeTruthy();
    expect(body.runId).not.toBe(parentRunId);

    const child = await env.GENERATION_DB.prepare(
      'select parent_run_id, status from runs where id = ?',
    ).bind(body.runId).first<{ parent_run_id: string; status: string }>();

    expect(child).toEqual({ parent_run_id: parentRunId, status: 'queued' });
    expect(await scalar(env.GENERATION_DB, "select count(*) as value from events where run_id = ? and type = 'run.queued'", body.runId))
      .toBe(1);
  });
});
