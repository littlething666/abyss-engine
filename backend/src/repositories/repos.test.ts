import { describe, it, expect } from 'vitest';
import { createDevicesRepo } from './devicesRepo';
import { createRunsRepo } from './runsRepo';
import { createArtifactsRepo, type ArtifactObjectStore } from './artifactsRepo';
import { createUsageCountersRepo, utcDay } from './usageCountersRepo';
import type { RunRow, EventRow, DeviceRow, ArtifactRow } from './types';
import { createFakeD1, q } from '../testStubs/fakeD1';

function createFakeObjectStore(): ArtifactObjectStore {
  const objects = new Map<string, string>();
  return {
    async put(key, value) { objects.set(key, value); },
    async get(key) {
      const value = objects.get(key);
      return value === undefined ? null : { text: async () => value };
    },
  };
}

describe('createDevicesRepo', () => {
  it('upserts a device and returns the row', async () => {
    const expected: DeviceRow = { id: 'dev-1', user_id: null, created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-05-05T00:00:00Z' };
    const { db } = createFakeD1([q(expected)]);
    const result = await createDevicesRepo(db).upsert('dev-1');
    expect(result.id).toBe('dev-1');
  });

  it('gets a device by id and returns null for unknown devices', async () => {
    const expected: DeviceRow = { id: 'dev-1', user_id: null, created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-05-05T00:00:00Z' };
    const { db } = createFakeD1([q(expected), q(null, 0)]);
    const repo = createDevicesRepo(db);
    await expect(repo.get('dev-1')).resolves.toMatchObject({ id: 'dev-1' });
    await expect(repo.get('missing')).resolves.toBeNull();
  });
});

describe('createRunsRepo', () => {
  const baseRun: RunRow = {
    id: 'run-1', device_id: 'dev-1', kind: 'crystal-trial', status: 'queued', input_hash: 'inp_abc123',
    idempotency_key: null, parent_run_id: null, supersedes_key: null, cancel_requested_at: null, cancel_reason: null,
    subject_id: 'subj-1', topic_id: 'top-1', created_at: '2026-05-05T00:00:00Z', started_at: null,
    finished_at: null, error_code: null, error_message: null, snapshot_json: { question_count: 5 }, next_event_seq: 0,
  };

  it('inserts and loads runs with JSON snapshot parsing at the D1 boundary', async () => {
    const { db } = createFakeD1([q(baseRun), q({ ...baseRun, snapshot_json: JSON.stringify(baseRun.snapshot_json) })]);
    const repo = createRunsRepo(db);
    await expect(repo.insertRun(baseRun)).resolves.toMatchObject({ id: 'run-1', status: 'queued' });
    await expect(repo.load('run-1')).resolves.toMatchObject({ snapshot_json: { question_count: 5 } });
  });

  it('appends events with D1-allocated monotonic sequence numbers', async () => {
    const eventRow: EventRow = { id: '1', run_id: 'run-1', device_id: 'dev-1', seq: 1, ts: '2026-05-05T00:00:00Z', type: 'run.created', payload_json: {} };
    const { db } = createFakeD1([q({ next_event_seq: 1 }), q(eventRow)]);
    const result = await createRunsRepo(db).append('run-1', 'dev-1', 'run.created', {});
    expect(result.seq).toBe(1);
    expect(result.type).toBe('run.created');
  });

  it('reserves idempotency and budget in atomicSubmitRun batch', async () => {
    const { db } = createFakeD1([q(null, 0), q(null, 0), q(null, 1), q(null, 1), q(null, 1)]);
    const result = await createRunsRepo(db).atomicSubmitRun({
      deviceId: 'dev-1', idempotencyKey: 'idem-1', kind: 'crystal-trial', inputHash: 'inp_abc123', status: 'queued',
      supersedesKey: null, subjectId: 'subj-1', topicId: 'top-1', snapshotJson: { subject_id: 'subj-1' }, parentRunId: null,
      runCap: 10, tokenCap: 500_000, startedAt: null, finishedAt: null,
    });
    expect(result.status).toBe('created');
    expect(result.runId).toBeTruthy();
  });

  it('returns idempotency hits without creating duplicate runs', async () => {
    const { db } = createFakeD1([
      q(null, 0), q(null, 0), q(null, 0), q(null, 0), q(null, 0), q({ run_id: 'run-existing' }),
    ]);
    const result = await createRunsRepo(db).atomicSubmitRun({
      deviceId: 'dev-1', idempotencyKey: 'idem-1', kind: 'crystal-trial', inputHash: 'inp_abc123', status: 'queued',
      supersedesKey: null, subjectId: null, topicId: null, snapshotJson: {}, parentRunId: null,
      runCap: 10, tokenCap: 500_000, startedAt: null, finishedAt: null,
    });
    expect(result).toEqual({ runId: 'run-existing', status: 'hit', existing: true });
  });

  it('cancelRequested returns reason only while cancellation is pending', async () => {
    const { db } = createFakeD1([
      q({ cancel_requested_at: '2026-05-05T01:00:00Z', cancel_reason: 'user', finished_at: null }),
      q({ cancel_requested_at: '2026-05-05T01:00:00Z', cancel_reason: 'user', finished_at: '2026-05-05T01:05:00Z' }),
    ]);
    const repo = createRunsRepo(db);
    await expect(repo.cancelRequested('run-1')).resolves.toBe('user');
    await expect(repo.cancelRequested('run-1')).resolves.toBeNull();
  });
});

describe('createArtifactsRepo', () => {
  const baseArtifact: ArtifactRow = {
    id: 'art-1', device_id: 'dev-1', created_by_run_id: 'run-1', kind: 'crystal-trial', input_hash: 'inp_abc123',
    storage_key: 'abyss/dev-1/crystal-trial/1/inp_abc123.json', content_hash: 'cnt_def456', schema_version: 1, created_at: '2026-05-05T00:00:00Z',
  };

  it('finds cache hits from D1 metadata and misses loudly as null', async () => {
    const { db } = createFakeD1([q(baseArtifact), q(null, 0)]);
    const repo = createArtifactsRepo(db, createFakeObjectStore());
    await expect(repo.findCacheHit('dev-1', 'crystal-trial', 'inp_abc123')).resolves.toMatchObject({ id: 'art-1' });
    await expect(repo.findCacheHit('dev-1', 'crystal-trial', 'missing')).resolves.toBeNull();
  });

  it('stores artifact bodies in R2 and D1 metadata rows use canonical keys', async () => {
    const objectStore = createFakeObjectStore();
    const { db, calls } = createFakeD1([q({ id: 'art-2' })]);
    const artifactId = await createArtifactsRepo(db, objectStore).putStorage(
      { deviceId: 'dev-1', kind: 'crystal-trial', inputHash: 'inp_xyz', payload: { questions: [] } },
      'cnt_newhash', 1, 'run-2',
    );
    expect(artifactId).toBe('art-2');
    expect(calls[0].args).toContain('abyss/dev-1/crystal-trial/1/inp_xyz.json');
  });

  it('reads artifact payloads from R2', async () => {
    const objectStore = createFakeObjectStore();
    await objectStore.put('abyss/dev-1/crystal-trial/1/inp_abc123.json', JSON.stringify({ mocked: true }));
    const { db } = createFakeD1();
    await expect(createArtifactsRepo(db, objectStore).getStorage('abyss/dev-1/crystal-trial/1/inp_abc123.json')).resolves.toEqual({ mocked: true });
  });
});

describe('createUsageCountersRepo', () => {
  it('utcDay returns YYYY-MM-DD and handles UTC rollover', () => {
    expect(utcDay(new Date('2026-05-05T12:00:00Z'))).toBe('2026-05-05');
    expect(utcDay(new Date('2026-05-05T23:59:59Z'))).toBe('2026-05-05');
    expect(utcDay(new Date('2026-05-06T00:00:01Z'))).toBe('2026-05-06');
  });

  it('records tokens through D1 upsert increments', async () => {
    const { db } = createFakeD1([q(null, 1), q(null, 1)]);
    const repo = createUsageCountersRepo(db);
    await expect(repo.recordTokens('dev-1', '2026-05-05', { prompt_tokens: 100, completion_tokens: 50 })).resolves.toBeUndefined();
    await expect(repo.recordTokens('dev-1', '2026-05-05', {})).resolves.toBeUndefined();
  });
});
