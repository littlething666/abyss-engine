/**
 * Repository unit tests — Phase 1 PR-B.
 *
 * Tests the Supabase-backed repo implementations with a manually-constructed
 * mock Supabase client.  No `vi.mock` — we inject a fake client directly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDevicesRepo, type IDevicesRepo } from './devicesRepo';
import { createRunsRepo, type IRunsRepo } from './runsRepo';
import { createArtifactsRepo, type ArtifactObjectStore, type IArtifactsRepo } from './artifactsRepo';
import { createUsageCountersRepo, utcDay, type IUsageCountersRepo } from './usageCountersRepo';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RunRow, EventRow, DeviceRow, ArtifactRow } from './types';

// ---------------------------------------------------------------------------
// Thenable query-builder mock.
//
// Imitates the Supabase PostgREST chain: `.from('t').select('*').eq(...).single()`
// returns a thenable that resolves to `{ data, error }`.
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

  // Attach thenable behaviour.  `await` calls `obj.then(resolve, reject)`.
  (chain as Record<string, unknown>).then = (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ) => {
    const { data, error } = getNextResult();
    if (error) reject(error);
    else resolve({ data, error: null });
  };

  return chain;
}

function createFakeSupabaseClient(
  fromQueue: QueuedResult[],
  rpcQueue: QueuedResult[],
): SupabaseClient {
  return {
    from: () =>
      createFakeQueryBuilder(() => fromQueue.shift() ?? { data: null, error: null }),
    rpc: () =>
      createFakeQueryBuilder(() => rpcQueue.shift() ?? { data: null, error: null }),
  } as unknown as SupabaseClient;
}

function createFakeObjectStore(): ArtifactObjectStore {
  const objects = new Map<string, string>();
  return {
    async put(key, value) {
      objects.set(key, value);
    },
    async get(key) {
      const value = objects.get(key);
      return value === undefined ? null : { text: async () => value };
    },
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function q(data: unknown): QueuedResult {
  return { data, error: null };
}

function qErr(message: string): QueuedResult {
  return { data: null, error: new Error(message) };
}

// ---------------------------------------------------------------------------
// Devices repo
// ---------------------------------------------------------------------------
describe('createDevicesRepo', () => {
  it('upserts a device and returns the row', async () => {
    const expected: DeviceRow = {
      id: 'dev-1',
      user_id: null,
      created_at: '2026-01-01T00:00:00Z',
      last_seen_at: '2026-05-05T00:00:00Z',
    };
    const db = createFakeSupabaseClient([q(expected)], []);
    const repo = createDevicesRepo(db);

    const result = await repo.upsert('dev-1');
    expect(result.id).toBe('dev-1');
  });

  it('gets a device by id', async () => {
    const expected: DeviceRow = {
      id: 'dev-1',
      user_id: null,
      created_at: '2026-01-01T00:00:00Z',
      last_seen_at: '2026-05-05T00:00:00Z',
    };
    const db = createFakeSupabaseClient([q(expected)], []);
    const repo = createDevicesRepo(db);

    const result = await repo.get('dev-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('dev-1');
  });

  it('returns null for unknown device', async () => {
    const db = createFakeSupabaseClient([q(null)], []);
    const repo = createDevicesRepo(db);

    const result = await repo.get('unknown-dev');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Runs repo
// ---------------------------------------------------------------------------
describe('createRunsRepo', () => {
  const baseRun: RunRow = {
    id: 'run-1',
    device_id: 'dev-1',
    kind: 'crystal-trial',
    status: 'queued',
    input_hash: 'inp_abc123',
    idempotency_key: null,
    parent_run_id: null,
    supersedes_key: null,
    cancel_requested_at: null,
    cancel_reason: null,
    subject_id: 'subj-1',
    topic_id: 'top-1',
    created_at: '2026-05-05T00:00:00Z',
    started_at: null,
    finished_at: null,
    error_code: null,
    error_message: null,
    snapshot_json: { question_count: 5 },
    next_event_seq: 0,
  };

  it('inserts a run and returns the row', async () => {
    const db = createFakeSupabaseClient([q(baseRun)], []);
    const repo = createRunsRepo(db);

    const result = await repo.insertRun(baseRun);
    expect(result.id).toBe('run-1');
    expect(result.status).toBe('queued');
  });

  it('loads a run by id', async () => {
    const db = createFakeSupabaseClient([q(baseRun)], []);
    const repo = createRunsRepo(db);

    const result = await repo.load('run-1');
    expect(result.id).toBe('run-1');
  });

  it('transition sets started_at on first non-queued transition', async () => {
    // transition() does 2 queries: select (current) then update
    const db = createFakeSupabaseClient(
      [q({ status: 'queued', started_at: null }), q(null)],
      [],
    );
    const repo = createRunsRepo(db);

    await expect(repo.transition('run-1', 'planning')).resolves.toBeUndefined();
  });

  it('append allocates seq via RPC and inserts event', async () => {
    const eventRow: EventRow = {
      id: '1',
      run_id: 'run-1',
      device_id: 'dev-1',
      seq: 1,
      ts: '2026-05-05T00:00:00Z',
      type: 'run.created',
      payload_json: {},
    };
    const db = createFakeSupabaseClient([q(eventRow)], [q(1)]);
    const repo = createRunsRepo(db);

    const result = await repo.append('run-1', 'dev-1', 'run.created', {});
    expect(result.seq).toBe(1);
    expect(result.type).toBe('run.created');
  });

  it('cancelRequested returns reason when cancel is pending', async () => {
    const db = createFakeSupabaseClient(
      [q({ cancel_requested_at: '2026-05-05T01:00:00Z', cancel_reason: 'user', finished_at: null })],
      [],
    );
    const repo = createRunsRepo(db);

    const result = await repo.cancelRequested('run-1');
    expect(result).toBe('user');
  });

  it('cancelRequested returns null when not cancelled', async () => {
    const db = createFakeSupabaseClient([q(baseRun)], []);
    const repo = createRunsRepo(db);

    const result = await repo.cancelRequested('run-1');
    expect(result).toBeNull();
  });

  it('cancelRequested returns null when already finished (race)', async () => {
    const db = createFakeSupabaseClient(
      [q({
        cancel_requested_at: '2026-05-05T01:00:00Z',
        cancel_reason: 'user',
        finished_at: '2026-05-05T01:05:00Z',
      })],
      [],
    );
    const repo = createRunsRepo(db);

    const result = await repo.cancelRequested('run-1');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Artifacts repo
// ---------------------------------------------------------------------------
describe('createArtifactsRepo', () => {
  const baseArtifact: ArtifactRow = {
    id: 'art-1',
    device_id: 'dev-1',
    created_by_run_id: 'run-1',
    kind: 'crystal-trial',
    input_hash: 'inp_abc123',
    storage_key: 'dev-1/crystal-trial/inp_abc123.json',
    content_hash: 'cnt_def456',
    schema_version: 1,
    created_at: '2026-05-05T00:00:00Z',
  };

  it('finds a cache hit', async () => {
    const db = createFakeSupabaseClient([q(baseArtifact)], []);
    const repo = createArtifactsRepo(db, createFakeObjectStore());

    const result = await repo.findCacheHit('dev-1', 'crystal-trial', 'inp_abc123');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('art-1');
    expect(result!.content_hash).toBe('cnt_def456');
  });

  it('returns null on cache miss', async () => {
    const db = createFakeSupabaseClient([q(null)], []);
    const repo = createArtifactsRepo(db, createFakeObjectStore());

    const result = await repo.findCacheHit('dev-1', 'crystal-trial', 'inp_missing');
    expect(result).toBeNull();
  });

  it('stores artifact in R2 and upserts metadata row', async () => {
    const db = createFakeSupabaseClient([q({ id: 'art-2' })], []);
    const repo = createArtifactsRepo(db, createFakeObjectStore());

    const artifactId = await repo.putStorage(
      { deviceId: 'dev-1', kind: 'crystal-trial', inputHash: 'inp_xyz', payload: { questions: [] } },
      'cnt_newhash',
      1,
      'run-2',
    );

    expect(artifactId).toBe('art-2');
  });

  it('reads artifact payloads from R2', async () => {
    const objectStore = createFakeObjectStore();
    await objectStore.put('dev-1/crystal-trial/inp_abc123.json', JSON.stringify({ mocked: true }));
    const db = createFakeSupabaseClient([], []);
    const repo = createArtifactsRepo(db, objectStore);

    await expect(repo.getStorage('dev-1/crystal-trial/inp_abc123.json')).resolves.toEqual({ mocked: true });
  });
});

// ---------------------------------------------------------------------------
// Usage counters repo
// ---------------------------------------------------------------------------
describe('createUsageCountersRepo', () => {
  it('utcDay returns YYYY-MM-DD', () => {
    expect(utcDay(new Date('2026-05-05T12:00:00Z'))).toBe('2026-05-05');
  });

  it('utcDay handles midnight rollover (Plan v3 Q15)', () => {
    expect(utcDay(new Date('2026-05-05T23:59:59Z'))).toBe('2026-05-05');
    expect(utcDay(new Date('2026-05-06T00:00:01Z'))).toBe('2026-05-06');
  });

  it('records tokens via RPC', async () => {
    const db = createFakeSupabaseClient([], [q(undefined)]);
    const repo = createUsageCountersRepo(db);

    await expect(
      repo.recordTokens('dev-1', '2026-05-05', { prompt_tokens: 100, completion_tokens: 50 }),
    ).resolves.toBeUndefined();
  });

  it('handles missing usage fields gracefully', async () => {
    const db = createFakeSupabaseClient([], [q(undefined)]);
    const repo = createUsageCountersRepo(db);

    await expect(
      repo.recordTokens('dev-1', '2026-05-05', {}),
    ).resolves.toBeUndefined();
  });
});
