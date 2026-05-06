/**
 * Settings route tests — Phase 3 full persistence.
 *
 * Uses the same vi.doMock Supabase pattern as runs.cancel.test.ts
 * to test the full middleware → route → repo chain.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    rpc: () => chain,
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

function headers(): HeadersInit {
  return {
    'x-abyss-device': DEVICE_ID,
    'content-type': 'application/json',
  };
}

/** In-memory settings store the mock Supabase client reads/writes. */
let settingsStore: Record<string, Record<string, unknown>> = {};

function createMockSupabaseClient(results: QueuedResult[]) {
  let idx = 0;

  const from = vi.fn((_table: string) => {
    return createFakeQueryBuilder(() => {
      if (idx >= results.length) {
        // Fallback for device_settings GET: return stored data.
        const deviceSettings = settingsStore[DEVICE_ID] ?? {};
        return q(
          Object.entries(deviceSettings).map(([key, value]) => ({
            key,
            value_json: value,
          })),
        );
      }
      return results[idx++];
    });
  });

  const rpc = vi.fn(() =>
    createFakeQueryBuilder(() => {
      if (idx >= results.length) return q(1);
      return results[idx++];
    }),
  );

  return { from, rpc };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PUT /v1/settings (Phase 3)', () => {
  beforeEach(() => {
    vi.resetModules();
    settingsStore = {};
  });

  it('PUT persists well-known settings keys', async () => {
    const mockClient = createMockSupabaseClient([
      // 1. devices upsert (middleware)
      q({
        id: DEVICE_ID,
        user_id: null,
        created_at: '2026-01-01T00:00:00Z',
        last_seen_at: '2026-05-05T00:00:00Z',
      }),
      // 2. device_settings upsert (3 rows)
      q(null),
    ]);

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');

    const response = await mockedApp.fetch(
      new Request('https://fakehost/v1/settings', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          'model-bindings': { 'crystal-trial': { modelId: 'gemini-flash' } },
          'response-healing': { enabled: true },
          'durable-kinds': ['crystal-trial'],
        }),
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(3);
  });

  it('PUT ignores unknown keys', async () => {
    const mockClient = createMockSupabaseClient([
      q({
        id: DEVICE_ID,
        user_id: null,
        created_at: '2026-01-01T00:00:00Z',
        last_seen_at: '2026-05-05T00:00:00Z',
      }),
      q(null), // upsert result
    ]);

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');

    const response = await mockedApp.fetch(
      new Request('https://fakehost/v1/settings', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          'model-bindings': {},
          'unknown-key': 'should-be-ignored',
        }),
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(1);
  });

  it('PUT with no well-known keys returns 400', async () => {
    const mockClient = createMockSupabaseClient([
      q({
        id: DEVICE_ID,
        user_id: null,
        created_at: '2026-01-01T00:00:00Z',
        last_seen_at: '2026-05-05T00:00:00Z',
      }),
    ]);

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');

    const response = await mockedApp.fetch(
      new Request('https://fakehost/v1/settings', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ 'unknown-key': 'val' }),
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('no well-known settings keys supplied');
  });

  it('PUT with invalid JSON returns 400', async () => {
    const mockClient = createMockSupabaseClient([
      q({
        id: DEVICE_ID,
        user_id: null,
        created_at: '2026-01-01T00:00:00Z',
        last_seen_at: '2026-05-05T00:00:00Z',
      }),
    ]);

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');

    const response = await mockedApp.fetch(
      new Request('https://fakehost/v1/settings', {
        method: 'PUT',
        headers: headers(),
        body: 'not-json',
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(400);
  });

  it('GET returns stored settings', async () => {
    settingsStore[DEVICE_ID] = {
      'model-bindings': { 'crystal-trial': { modelId: 'gemini-pro' } },
    };

    const mockClient = createMockSupabaseClient([
      // devices upsert
      q({
        id: DEVICE_ID,
        user_id: null,
        created_at: '2026-01-01T00:00:00Z',
        last_seen_at: '2026-05-05T00:00:00Z',
      }),
      // device_settings select → our fallback returns settingsStore
    ]);

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => mockClient,
    }));

    const { default: mockedApp } = await import('../index');

    const response = await mockedApp.fetch(
      new Request('https://fakehost/v1/settings', {
        method: 'GET',
        headers: headers(),
      }),
      {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE: 'sb-sr-test',
        ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.settings).toBeDefined();
    expect(body.settings['model-bindings']).toEqual({
      'crystal-trial': { modelId: 'gemini-pro' },
    });
  });
});
