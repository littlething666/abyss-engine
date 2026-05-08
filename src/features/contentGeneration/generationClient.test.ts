import { describe, expect, it, vi } from 'vitest';

import type { RunEvent } from '@/features/generationContracts';
import type { IGenerationRunRepository, RunSnapshot } from '@/types/repository';

import { createGenerationClient } from './generationClient';

function mockRepo(): IGenerationRunRepository {
  return {
    submitRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
    getRun: vi.fn(),
    streamRunEvents: vi.fn(),
    cancelRun: vi.fn().mockResolvedValue(undefined),
    retryRun: vi.fn().mockResolvedValue({ runId: 'run-retry' }),
    listRuns: vi.fn().mockResolvedValue([]),
    getArtifact: vi.fn(),
  };
}

describe('createGenerationClient', () => {
  it('submits topic-content intents without client-built snapshots', async () => {
    const local = mockRepo();
    const durable = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: durable,
    });

    await client.startTopicContent({
      kind: 'topic-content',
      subjectId: 'sub-1',
      topicId: 'topic-1',
      stage: 'theory',
    });

    expect(local.submitRun).toHaveBeenCalledTimes(1);
    expect(durable.submitRun).not.toHaveBeenCalled();
    const [input, idempotencyKey] = vi.mocked(local.submitRun).mock.calls[0]!;
    expect(input).toEqual({
      kind: 'topic-content',
      subjectId: 'sub-1',
      topicId: 'topic-1',
      stage: 'theory',
    });
    expect(JSON.stringify(input)).not.toContain('snapshot');
    expect(JSON.stringify(input)).not.toContain('model');
    expect(idempotencyKey).toMatch(/^run:[0-9a-f-]{36}$/i);
  });

  it('forwards explicit idempotencyKey unchanged', async () => {
    const local = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    await client.startTopicContent(
      { kind: 'topic-content', subjectId: 'sub-1', topicId: 'topic-1', stage: 'study-cards' },
      { idempotencyKey: 'explicit-key' },
    );

    const [, key] = vi.mocked(local.submitRun).mock.calls[0]!;
    expect(key).toBe('explicit-key');
  });

  it('routes each intent kind to durable when enabled', async () => {
    const local = mockRepo();
    const durable = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: true },
      localRepo: local,
      durableRepo: durable,
    });

    await client.startTopicExpansion({ kind: 'topic-expansion', subjectId: 'sub-1', topicId: 'topic-1', nextLevel: 2 });
    await client.startSubjectGraph({ kind: 'subject-graph', subjectId: 'sub-1', stage: 'topics', checklist: { topicName: 'Algebra' } });
    await client.startCrystalTrial({ kind: 'crystal-trial', subjectId: 'sub-1', topicId: 'topic-1', currentLevel: 0, targetLevel: 1 });

    expect(durable.submitRun).toHaveBeenCalledTimes(3);
    expect(local.submitRun).not.toHaveBeenCalled();
    expect(vi.mocked(durable.submitRun).mock.calls.map(([input]) => input)).toEqual([
      { kind: 'topic-expansion', subjectId: 'sub-1', topicId: 'topic-1', nextLevel: 2 },
      { kind: 'subject-graph', subjectId: 'sub-1', stage: 'topics', checklist: { topicName: 'Algebra' } },
      { kind: 'crystal-trial', subjectId: 'sub-1', topicId: 'topic-1', currentLevel: 0, targetLevel: 1 },
    ]);
  });

  it('cancel and retry delegate to the selected repository', async () => {
    const local = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    await client.cancel('run-a', 'user');
    expect(local.cancelRun).toHaveBeenCalledWith('run-a', 'user');

    await client.retry('run-b', { stage: 'theory', jobId: 'j1' });
    expect(local.retryRun).toHaveBeenCalledWith('run-b', { stage: 'theory', jobId: 'j1' });
  });

  it('observe delegates streamRunEvents', async () => {
    const local = mockRepo();
    async function* gen(): AsyncGenerator<RunEvent> {
      yield { type: 'run.queued', runId: 'r', seq: 1, ts: '1970-01-01T00:00:00.000Z' };
    }
    vi.mocked(local.streamRunEvents).mockReturnValue(gen());

    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    for await (const e of client.observe('run-x', 3)) expect(e.type).toBe('run.queued');
    expect(local.streamRunEvents).toHaveBeenCalledWith('run-x', 3);
  });

  it('listActive and listRecent delegate listRuns', async () => {
    const local = mockRepo();
    const rows: RunSnapshot[] = [{
      runId: 'a',
      deviceId: 'd',
      kind: 'crystal-trial',
      status: 'applied-local',
      inputHash: 'inp_x',
      createdAt: 1,
      snapshotJson: {} as RunSnapshot['snapshotJson'],
      jobs: [],
    }];
    vi.mocked(local.listRuns).mockResolvedValue(rows);

    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    await expect(client.listActive()).resolves.toEqual(rows);
    expect(local.listRuns).toHaveBeenCalledWith({ status: 'active' });

    await client.listRecent(15);
    expect(local.listRuns).toHaveBeenCalledWith({ status: 'recent', limit: 15 });
  });
});

describe('registerGenerationClient / getGenerationClient', () => {
  it('returns the registered client', async () => {
    vi.resetModules();
    const mod = await import('./generationClient');
    const client = mod.createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: mockRepo(),
      durableRepo: mockRepo(),
    });
    mod.registerGenerationClient(client);
    expect(mod.getGenerationClient()).toBe(client);
  });

  it('throw when nothing registered', async () => {
    vi.resetModules();
    const mod = await import('./generationClient');
    expect(() => mod.getGenerationClient()).toThrow(/registerGenerationClient/);
  });
});
