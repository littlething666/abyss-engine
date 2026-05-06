/**
 * SSE resume tests — Phase 1 PR-G.
 *
 * Tests the `GET /v1/runs/:id/events` SSE endpoint with mocked Supabase:
 * - Replays persisted events with seq > lastSeq
 * - Honors Last-Event-ID header
 * - Honors ?lastSeq= query parameter
 * - Returns correct SSE framing (Content-Type, cache headers)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const DEVICE_ID = '00000000-0000-0000-0000-000000000001';

function createMockSupabaseClient(results: QueuedResult[]) {
  let idx = 0;

  const from = () => {
    return createFakeQueryBuilder(() => {
      if (idx >= results.length) return q(null);
      return results[idx++];
    });
  };

  const rpc = () => {
    return createFakeQueryBuilder(() => {
      if (idx >= results.length) return q(1);
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

describe('GET /v1/runs/:id/events — SSE resume tests', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns correct SSE Content-Type and cache headers', async () => {
    const runId = 'run-sse-001';

    const mockClient = createMockSupabaseClient([
      // 1. devices upsert (middleware)
      q({ id: DEVICE_ID, user_id: null, created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-05-05T00:00:00Z' }),
      // 2. load run (ownership check)
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'ready',
        input_hash: 'inp_stub',
        finished_at: '2026-05-05T00:05:00Z',
        created_at: '2026-05-05T00:00:00Z',
        snapshot_json: {},
        next_event_seq: 0,
      }),
      // 3. load run (keepalive check)
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'ready',
        finished_at: '2026-05-05T00:05:00Z',
        created_at: '2026-05-05T00:00:00Z',
        snapshot_json: {},
        next_event_seq: 0,
      }),
    ]);

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/events`, {
        headers: { 'x-abyss-device': DEVICE_ID },
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
        OPENROUTER_API_KEY: 'sk-or-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(response.headers.get('connection')).toBe('keep-alive');
  });

  it('replays persisted events with seq > lastSeq (Last-Event-ID header)', async () => {
    const runId = 'run-sse-002';
    const lastSeq = 2;

    const mockClient = createMockSupabaseClient([
      // 1. devices upsert
      q({ id: DEVICE_ID }),
      // 2. load run (ownership check)
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'generating_stage',
        finished_at: null,
        created_at: '2026-05-05T00:00:00Z',
        snapshot_json: {},
        next_event_seq: 3,
      }),
      // 3. eventsAfter(runId, deviceId, lastSeq=2) → returns events 3, 4, 5
      q([
        {
          id: '3',
          run_id: runId,
          device_id: DEVICE_ID,
          seq: 3,
          ts: '2026-05-05T00:00:03Z',
          type: 'stage.progress',
          payload_json: { stage: 'generate', progress: 0.5 },
        },
        {
          id: '4',
          run_id: runId,
          device_id: DEVICE_ID,
          seq: 4,
          ts: '2026-05-05T00:00:04Z',
          type: 'artifact.ready',
          payload_json: { artifactId: 'art-1', contentHash: 'cnt_abc', kind: 'crystal-trial' },
        },
        {
          id: '5',
          run_id: runId,
          device_id: DEVICE_ID,
          seq: 5,
          ts: '2026-05-05T00:00:05Z',
          type: 'run.completed',
          payload_json: {},
        },
      ]),
      // 4. load run (keepalive check — still active? No, finished later in stream)
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'ready',
        finished_at: '2026-05-05T00:05:00Z',
        created_at: '2026-05-05T00:00:00Z',
        snapshot_json: {},
        next_event_seq: 3,
      }),
    ]);

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/events`, {
        headers: {
          'x-abyss-device': DEVICE_ID,
          'last-event-id': String(lastSeq),
        },
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
        OPENROUTER_API_KEY: 'sk-or-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(200);

    const text = await response.text();
    // Should contain SSE frames for events 3, 4, 5 only (seq > 2)
    const lines = text.split('\n').filter((l) => l.startsWith('id:'));
    // Each event has "id: <seq>" line
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toBe('id: 3');
    expect(lines[1]).toBe('id: 4');
    expect(lines[2]).toBe('id: 5');

    // Verify seq 1 and 2 are NOT replayed
    expect(text).not.toContain('"seq":1');
    expect(text).not.toContain('"seq":2');
  });

  it('replays persisted events with lastSeq query param', async () => {
    const runId = 'run-sse-003';
    const lastSeq = 0;

    const mockClient = createMockSupabaseClient([
      // 1. devices upsert
      q({ id: DEVICE_ID }),
      // 2. load run
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'ready',
        finished_at: '2026-05-05T00:05:00Z',
        created_at: '2026-05-05T00:00:00Z',
        snapshot_json: {},
        next_event_seq: 1,
      }),
      // 3. eventsAfter(runId, deviceId, 0) → returns all events
      q([
        {
          id: '1',
          run_id: runId,
          device_id: DEVICE_ID,
          seq: 1,
          ts: '2026-05-05T00:00:01Z',
          type: 'run.queued',
          payload_json: {},
        },
      ]),
      // 4. load run (keepalive)
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'ready',
        finished_at: '2026-05-05T00:05:00Z',
        created_at: '2026-05-05T00:00:00Z',
        snapshot_json: {},
        next_event_seq: 1,
      }),
    ]);

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/events?lastSeq=${lastSeq}`, {
        headers: { 'x-abyss-device': DEVICE_ID },
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
        OPENROUTER_API_KEY: 'sk-or-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('id: 1');
    expect(text).toContain('run.queued');
  });

  it('returns 404 when device does not own the run', async () => {
    const runId = 'run-sse-004';
    const otherDevice = '00000000-0000-0000-0000-000000000099';

    const mockClient = createMockSupabaseClient([
      // 1. devices upsert for otherDevice
      q({ id: otherDevice }),
      // 2. load run — returns run owned by different device
      q({
        id: runId,
        device_id: '11111111-1111-1111-1111-111111111111',
        kind: 'crystal-trial',
        status: 'queued',
        finished_at: null,
        created_at: '2026-05-05T00:00:00Z',
        snapshot_json: {},
        next_event_seq: 0,
      }),
    ]);

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/events`, {
        headers: { 'x-abyss-device': otherDevice },
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

  it('emits keepalive comment for still-active runs', async () => {
    const runId = 'run-sse-005';

    const mockClient = createMockSupabaseClient([
      // 1. devices upsert
      q({ id: DEVICE_ID }),
      // 2. load run (ownership)
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'generating_stage',
        finished_at: null,  // still active!
        created_at: '2026-05-05T00:00:00Z',
        snapshot_json: {},
        next_event_seq: 0,
      }),
      // 3. eventsAfter — no new events
      q([]),
      // 4. load run (keepalive check — still active)
      q({
        id: runId,
        device_id: DEVICE_ID,
        kind: 'crystal-trial',
        status: 'generating_stage',
        finished_at: null,
        created_at: '2026-05-05T00:00:00Z',
        snapshot_json: {},
        next_event_seq: 0,
      }),
    ]);

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');
    const response = await mockedApp.fetch(
      new Request(`https://fakehost/v1/runs/${runId}/events`, {
        headers: { 'x-abyss-device': DEVICE_ID },
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
        OPENROUTER_API_KEY: 'sk-or-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    // Should contain the keepalive comment for active runs
    expect(text).toContain(': keepalive');
    expect(text).toContain('run still active');
  });
});

// ---------------------------------------------------------------------------
// Phase 2 PR-2E: Cross-pipeline SSE resume tests
// ---------------------------------------------------------------------------

/** All four pipeline kinds for cross-pipeline SSE coverage. */
const SSE_PIPELINE_KINDS = [
  'crystal-trial',
  'topic-content',
  'topic-expansion',
  'subject-graph',
] as const;

describe('Cross-pipeline SSE resume tests (all 4 pipeline kinds)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const kind of SSE_PIPELINE_KINDS) {
    describe(`SSE for ${kind}`, () => {
      it(`returns correct SSE headers for ${kind} run`, async () => {
        const runId = `run-sse-${kind}-001`;

        const mockClient = createMockSupabaseClient([
          q({ id: DEVICE_ID }),
          q({
            id: runId,
            device_id: DEVICE_ID,
            kind,
            status: 'ready',
            finished_at: '2026-05-05T00:05:00Z',
            created_at: '2026-05-05T00:00:00Z',
            snapshot_json: {},
            next_event_seq: 0,
          }),
          q({
            id: runId,
            device_id: DEVICE_ID,
            kind,
            status: 'ready',
            finished_at: '2026-05-05T00:05:00Z',
            created_at: '2026-05-05T00:00:00Z',
            snapshot_json: {},
            next_event_seq: 0,
          }),
        ]);

        vi.doMock('@supabase/supabase-js', () => ({
          createClient: () => mockClient,
        }));

        const { default: mockedApp } = await import('../index');
        const response = await mockedApp.fetch(
          new Request(`https://fakehost/v1/runs/${runId}/events`, {
            headers: { 'x-abyss-device': DEVICE_ID },
          }),
          {
            SUPABASE_URL: 'https://test.supabase.co',
            SUPABASE_SERVICE_ROLE: 'sb-sr-test',
            OPENROUTER_API_KEY: 'sk-or-test',
            ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
          },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/event-stream');
        expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
        expect(response.headers.get('connection')).toBe('keep-alive');
      });

      it(`replays persisted events with Last-Event-ID for ${kind} run`, async () => {
        const runId = `run-sse-${kind}-002`;
        const lastSeq = 2;

        const mockClient = createMockSupabaseClient([
          q({ id: DEVICE_ID }),
          q({
            id: runId,
            device_id: DEVICE_ID,
            kind,
            status: 'generating_stage',
            finished_at: null,
            created_at: '2026-05-05T00:00:00Z',
            snapshot_json: {},
            next_event_seq: 3,
          }),
          q([
            {
              id: '3',
              run_id: runId,
              device_id: DEVICE_ID,
              seq: 3,
              ts: '2026-05-05T00:00:03Z',
              type: 'stage.progress',
              payload_json: { stage: 'generate', progress: 0.5 },
            },
            {
              id: '4',
              run_id: runId,
              device_id: DEVICE_ID,
              seq: 4,
              ts: '2026-05-05T00:00:04Z',
              type: 'artifact.ready',
              payload_json: { artifactId: 'art-1', kind, contentHash: 'cnt_abc' },
            },
            {
              id: '5',
              run_id: runId,
              device_id: DEVICE_ID,
              seq: 5,
              ts: '2026-05-05T00:00:05Z',
              type: 'run.completed',
              payload_json: {},
            },
          ]),
          q({
            id: runId,
            device_id: DEVICE_ID,
            kind,
            status: 'ready',
            finished_at: '2026-05-05T00:05:00Z',
            created_at: '2026-05-05T00:00:00Z',
            snapshot_json: {},
            next_event_seq: 3,
          }),
        ]);

        vi.doMock('@supabase/supabase-js', () => ({
          createClient: () => mockClient,
        }));

        const { default: mockedApp } = await import('../index');
        const response = await mockedApp.fetch(
          new Request(`https://fakehost/v1/runs/${runId}/events`, {
            headers: {
              'x-abyss-device': DEVICE_ID,
              'last-event-id': String(lastSeq),
            },
          }),
          {
            SUPABASE_URL: 'https://test.supabase.co',
            SUPABASE_SERVICE_ROLE: 'sb-sr-test',
            OPENROUTER_API_KEY: 'sk-or-test',
            ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
          },
        );

        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).not.toContain('"seq":1');
        expect(text).not.toContain('"seq":2');
        expect(text).toContain('id: 3');
        expect(text).toContain('id: 4');
        expect(text).toContain('id: 5');
      });

      it(`returns 404 for ${kind} run owned by different device`, async () => {
        const runId = `run-sse-${kind}-003`;
        const otherDevice = '00000000-0000-0000-0000-000000000099';

        const mockClient = createMockSupabaseClient([
          q({ id: otherDevice }),
          q({
            id: runId,
            device_id: '11111111-1111-1111-1111-111111111111',
            kind,
            status: 'queued',
            finished_at: null,
            created_at: '2026-05-05T00:00:00Z',
            snapshot_json: {},
            next_event_seq: 0,
          }),
        ]);

        vi.doMock('@supabase/supabase-js', () => ({
          createClient: () => mockClient,
        }));

        const { default: mockedApp } = await import('../index');
        const response = await mockedApp.fetch(
          new Request(`https://fakehost/v1/runs/${runId}/events`, {
            headers: { 'x-abyss-device': otherDevice },
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
    });
  }
});
