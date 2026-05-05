/**
 * Route-level cancel tests — Phase 1 PR-G.
 *
 * Tests the cancel lifecycle at the HTTP surface with mocked Supabase client.
 * Uses fake query builders along the full middleware → route → repo chain.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/** Build a mock Supabase client that responds in the correct call order. */
function createMockSupabaseClient(results: QueuedResult[]) {
  let idx = 0;

  const from = () => {
    return createFakeQueryBuilder(() => {
      if (idx >= results.length) {
        console.warn(`[mock supabase] ran out of results at idx=${idx}, returning null`);
        return q(null);
      }
      return results[idx++];
    });
  };

  // rpc is used for allocate_event_seq — returns a simple value, not a row.
  // The repos.append calls it first (rpc), then uses the result for insert.
  // In our mock, rpc is called via .rpc('allocate_event_seq', { p_run_id }).
  const rpc = () => {
    return createFakeQueryBuilder(() => {
      if (idx >= results.length) {
        console.warn(`[mock supabase] rpc ran out of results at idx=${idx}, returning 1`);
        return q(1);
      }
      return results[idx++];
    });
  };

  const storage = {
    from: () => ({
      upload: () => Promise.resolve({ error: null }),
      download: () =>
        Promise.resolve({ data: { text: async () => '{}' }, error: null }),
      createSignedUrl: () =>
        Promise.resolve({ data: { signedUrl: 'https://x' }, error: null }),
    }),
  };

  return { from, rpc, storage };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /v1/runs/:id/cancel — cancel race tests', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Reset the cached Supabase client between tests.
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
    const mockClient = createMockSupabaseClient([
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

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    // Dynamic import to get the app with our mock in place.
    const { default: mockedApp } = await import('../index');

    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
        method: 'POST',
        headers: headers(),
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
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

    const mockClient = createMockSupabaseClient([
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

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
        method: 'POST',
        headers: headers(),
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
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

    const mockClient = createMockSupabaseClient([
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

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
        method: 'POST',
        headers: headers(otherDevice),
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
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
    const mockClient = createMockSupabaseClient([
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

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/cancel`, {
        method: 'POST',
        headers: headers(),
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
        OPENROUTER_API_KEY: 'sk-or-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('cancel_acknowledged');
  });
});
