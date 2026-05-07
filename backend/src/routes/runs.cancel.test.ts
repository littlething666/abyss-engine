/**
 * Route-level cancel tests — Phase 1 PR-G.
 *
 * Tests the cancel lifecycle at the HTTP surface with mocked D1 client.
 * Uses fake query builders along the full middleware → route → repo chain.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeD1 } from '../testStubs/fakeD1';

// ---------------------------------------------------------------------------
// Fake query builder (mirrors repos.test.ts pattern)
// ---------------------------------------------------------------------------
type QueuedResult = { data: unknown; error: Error | null };

function createFakeQueryBuilder(getNextResult: () => QueuedResult) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    upsert: () => chain,
    delete: () => chain,
    eq: () => chain,
    neq: () => chain,
    gt: () => chain,
    gte: () => chain,
    lt: () => chain,
    lte: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => chain,
    maybeSingle: () => chain,
    range: () => chain,
  };

  (chain as Record<string, unknown>).then = (
    resolve: (v: unknown) => void,
    _reject: (e: unknown) => void,
  ) => {
    const { data, error } = getNextResult();
    if (error) _reject(error);
    else resolve({ data, error: null });
  };

  return chain;
}

function q(data: unknown): QueuedResult {
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const DEVICE_ID = '00000000-0000-0000-0000-000000000001';

/** All four pipeline kinds for cross-pipeline cancel coverage (Phase 2 PR-2E). */
const PIPELINE_KINDS = [
  'crystal-trial',
  'topic-content',
  'topic-expansion',
  'subject-graph',
] as const;

function headers(deviceId = DEVICE_ID, extra?: Record<string, string>): Record<string, string> {
  return {
    'x-abyss-device': deviceId,
    'content-type': 'application/json',
    ...extra,
  };
}

/**
 * Call chain for `POST /v1/runs/:id/cancel`:
 *
 * Middleware:
 *   deviceIdMiddleware → select/upsert devices table
 *
 * Route handler:
 *   load run     → select * from runs where id = runId
 *   check device ownership
 *   check finished_at
 *   requestCancel → select finished_at from runs where id = runId (then update if null)
 *   append event  → rpc allocate_event_seq(runId) → insert into events
 */

/** Build a mock D1 client that responds in the correct call order. */
function createMockD1(results: QueuedResult[]) {
  return createFakeD1(results.map((result) => ({ data: result.data, error: result.error, changes: 1 }))).db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /v1/runs/:id/cancel — cancel race tests', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Reset the cached D1 client between tests.
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = OLD_ENV;
  });

  it('cancel-before-start: accepts cancel on queued run and returns cancel_acknowledged', async () => {
    const runId = 'run-cancel-001';

    // Call order for deviceIdMiddleware + cancel route:
    // 1. Middleware: devices upsert → returns device row
    // 2. Route load: runs select → returns queued run (by device)
    // 3. Route requestCancel check: runs select finished_at → null (not finished)
    // 4. Route requestCancel update: runs update cancel_requested_at
    // 5. Route append rpc: allocate_event_seq → returns 1
    // 6. Route append insert: events insert → returns event row
    const mockClient = createMockD1([
      // 1. devices upsert: returns device row
      q({ id: DEVICE_ID, user_id: null, created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-05-05T00:00:00Z' }),
      // 2. runs select: returns queued run owned by DEVICE_ID
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'queued',
        input_hash: 'inp_stub',
        idempotency_key: null,
        parent_run_id: null,
        cancel_requested_at: null,
        cancel_reason: null,
        subject_id: 's1',
        topic_id: 't1',
        created_at: '2026-05-05T00:00:00Z',
        started_at: null,
        finished_at: null,
        error_code: null,
        error_message: null,
        snapshot_json: {},
        next_event_seq: 0,
      }),
      // 3. requestCancel: select finished_at → null (story 1: select with maybeSingle)
      q({ id: runId, finished_at: null }),
      // 4. requestCancel: update cancel_requested_at → success (null data with no error)
      q(null),
      // 5. rpc allocate_event_seq → returns 1
      q(1),
      // 6. insert events → returns event row
      q({
        id: 'ev-1',
        run_id: runId,
        device_id: DEVICE_ID,
        seq: 1,
        ts: '2026-05-05T00:00:01Z',
        type: 'run.cancel-acknowledged',
        payload_json: { reason: 'user' },
      }),
    ]);

    // Dynamic import to get the app with our mock in place.
    const { default: mockedApp } = await import('../index');

    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
        method: 'POST',
        headers: headers(),
      }),
      {
        GENERATION_DB: mockClient,
        OPENROUTER_API_KEY: 'sk-or-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('cancel_acknowledged');
  });

  it('cancel-after-completion: returns 409 when run is already terminal', async () => {
    const runId = 'run-cancel-002';

    const mockClient = createMockD1([
      // 1. devices upsert
      q({ id: DEVICE_ID, user_id: null, created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-05-05T00:00:00Z' }),
      // 2. runs select: returns terminal (finished) run
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'ready',
        input_hash: 'inp_stub',
        idempotency_key: null,
        parent_run_id: null,
        cancel_requested_at: null,
        cancel_reason: null,
        subject_id: 's1',
        topic_id: 't1',
        created_at: '2026-05-05T00:00:00Z',
        started_at: '2026-05-05T00:00:00Z',
        finished_at: '2026-05-05T00:05:00Z',  // already finished
        error_code: null,
        error_message: null,
        snapshot_json: {},
        next_event_seq: 0,
      }),
    ]);

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
        method: 'POST',
        headers: headers(),
      }),
      {
        GENERATION_DB: mockClient,
        OPENROUTER_API_KEY: 'sk-or-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('run_already_terminal');
  });

  it('cancel-device-ownership: returns 404 when device does not own the run', async () => {
    const runId = 'run-cancel-003';
    const otherDevice = '00000000-0000-0000-0000-000000000099';

    const mockClient = createMockD1([
      // 1. devices upsert for otherDevice
      q({ id: otherDevice, user_id: null, created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-05-05T00:00:00Z' }),
      // 2. runs select: returns run owned by DIFFERENT device
      q({
        id: runId,
        device_id: '11111111-1111-1111-1111-111111111111',  // different device
        kind: 'crystal-trial',
        status: 'queued',
        input_hash: 'inp_stub',
        idempotency_key: null,
        parent_run_id: null,
        cancel_requested_at: null,
        cancel_reason: null,
        subject_id: 's1',
        topic_id: 't1',
        created_at: '2026-05-05T00:00:00Z',
        started_at: null,
        finished_at: null,
        error_code: null,
        error_message: null,
        snapshot_json: {},
        next_event_seq: 0,
      }),
    ]);

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
        method: 'POST',
        headers: headers(otherDevice),
      }),
      {
        GENERATION_DB: mockClient,
        OPENROUTER_API_KEY: 'sk-or-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(404);
  });

  it('cancel-mid-stage: cancel requested between steps emits cancel_acknowledged', async () => {
    const runId = 'run-cancel-004';

    // This test verifies the cancel route works on an in-progress
    // (generating_stage) run — the route only writes cancel_requested_at
    // and emits cancel_acknowledged. The actual terminal cancelled event
    // is emitted by the workflow when it polls and aborts.
    const mockClient = createMockD1([
      // 1. devices upsert
      q({ id: DEVICE_ID, user_id: null, created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-05-05T00:00:00Z' }),
      // 2. runs select: returns generating_stage run (not finished)
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'generating_stage',
        input_hash: 'inp_stub',
        idempotency_key: null,
        parent_run_id: null,
        cancel_requested_at: null,
        cancel_reason: null,
        subject_id: 's1',
        topic_id: 't1',
        created_at: '2026-05-05T00:00:00Z',
        started_at: '2026-05-05T00:01:00Z',
        finished_at: null,  // mid-run, not finished
        error_code: null,
        error_message: null,
        snapshot_json: {},
        next_event_seq: 0,
      }),
      // 3. requestCancel: select finished_at → null
      q({ id: runId, finished_at: null }),
      // 4. requestCancel: update cancel_requested_at
      q(null),
      // 5. rpc allocate_event_seq
      q(2),
      // 6. insert events
      q({
        id: 'ev-2',
        run_id: runId,
        device_id: DEVICE_ID,
        seq: 2,
        ts: '2026-05-05T00:02:00Z',
        type: 'run.cancel-acknowledged',
        payload_json: { reason: 'user' },
      }),
    ]);

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
        method: 'POST',
        headers: headers(),
      }),
      {
        GENERATION_DB: mockClient,
        OPENROUTER_API_KEY: 'sk-or-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('cancel_acknowledged');
  });
});

// ---------------------------------------------------------------------------
// Phase 2 PR-2E: Cross-pipeline cancel race tests
// ---------------------------------------------------------------------------
describe('Cross-pipeline cancel race tests (all 4 pipeline kinds)', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = OLD_ENV;
  });

  for (const kind of PIPELINE_KINDS) {
    describe(`cancel-before-start for ${kind}`, () => {
      it(`accepts cancel on queued ${kind} run and returns cancel_acknowledged`, async () => {
        const runId = `run-cancel-${kind}-001`;

        const mockClient = createMockD1([
          q({ id: DEVICE_ID, user_id: null, created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-05-05T00:00:00Z' }),
          q({
            id: runId,
            device_id: DEVICE_ID,
            kind,
            status: 'queued',
            input_hash: 'inp_stub',
            idempotency_key: null,
            parent_run_id: null,
            cancel_requested_at: null,
            cancel_reason: null,
            subject_id: 's1',
            topic_id: 't1',
            created_at: '2026-05-05T00:00:00Z',
            started_at: null,
            finished_at: null,
            error_code: null,
            error_message: null,
            snapshot_json: {},
            next_event_seq: 0,
          }),
          q({ id: runId, finished_at: null }),
          q(null),
          q(1),
          q({
            id: 'ev-x',
            run_id: runId,
            device_id: DEVICE_ID,
            seq: 1,
            ts: '2026-05-05T00:00:01Z',
            type: 'run.cancel-acknowledged',
            payload_json: { reason: 'user' },
          }),
        ]);

        const { default: mockedApp } = await import('../index');
        const response = await mockedApp.fetch(
          new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
            method: 'POST',
            headers: headers(),
          }),
          {
            GENERATION_DB: mockClient,
            OPENROUTER_API_KEY: 'sk-or-test',
            ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as { status: string };
        expect(body.status).toBe('cancel_acknowledged');
      });

      it(`returns 409 when ${kind} run is already terminal`, async () => {
        const runId = `run-cancel-${kind}-002`;

        const mockClient = createMockD1([
          q({ id: DEVICE_ID }),
          q({
            id: runId,
            device_id: DEVICE_ID,
            kind,
            status: 'ready',
            input_hash: 'inp_stub',
            created_at: '2026-05-05T00:00:00Z',
            started_at: '2026-05-05T00:00:00Z',
            finished_at: '2026-05-05T00:05:00Z',
            cancel_requested_at: null,
            cancel_reason: null,
            idempotency_key: null,
            parent_run_id: null,
            subject_id: 's1',
            topic_id: 't1',
            error_code: null,
            error_message: null,
            snapshot_json: {},
            next_event_seq: 0,
          }),
        ]);

        const { default: mockedApp } = await import('../index');
        const response = await mockedApp.fetch(
          new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
            method: 'POST',
            headers: headers(),
          }),
          {
            GENERATION_DB: mockClient,
            OPENROUTER_API_KEY: 'sk-or-test',
            ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
          },
        );

        expect(response.status).toBe(409);
      });

      it(`cancel-mid-stage for ${kind} returns cancel_acknowledged`, async () => {
        const runId = `run-cancel-${kind}-003`;

        const mockClient = createMockD1([
          q({ id: DEVICE_ID }),
          q({
            id: runId,
            device_id: DEVICE_ID,
            kind,
            status: 'generating_stage',
            input_hash: 'inp_stub',
            idempotency_key: null,
            parent_run_id: null,
            cancel_requested_at: null,
            cancel_reason: null,
            subject_id: 's1',
            topic_id: 't1',
            created_at: '2026-05-05T00:00:00Z',
            started_at: '2026-05-05T00:01:00Z',
            finished_at: null,
            error_code: null,
            error_message: null,
            snapshot_json: {},
            next_event_seq: 0,
          }),
          q({ id: runId, finished_at: null }),
          q(null),
          q(2),
          q({
            id: 'ev-y',
            run_id: runId,
            device_id: DEVICE_ID,
            seq: 2,
            ts: '2026-05-05T00:02:00Z',
            type: 'run.cancel-acknowledged',
            payload_json: { reason: 'user' },
          }),
        ]);

        const { default: mockedApp } = await import('../index');
        const response = await mockedApp.fetch(
          new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
            method: 'POST',
            headers: headers(),
          }),
          {
            GENERATION_DB: mockClient,
            OPENROUTER_API_KEY: 'sk-or-test',
            ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as { status: string };
        expect(body.status).toBe('cancel_acknowledged');
      });
    });
  }
});
