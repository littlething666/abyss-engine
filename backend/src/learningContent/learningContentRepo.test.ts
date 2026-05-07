import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLearningContentRepo } from './learningContentRepo';

type QueuedResult = { data: unknown; error: Error | null };
type Call = { table: string; op: string; args: unknown[] };

function q(data: unknown): QueuedResult {
  return { data, error: null };
}

function qErr(message: string): QueuedResult {
  return { data: null, error: new Error(message) };
}

function createFakeSupabaseClient(queue: QueuedResult[]): { db: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];

  function chainFor(table: string) {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const op of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'order', 'single', 'maybeSingle']) {
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
    }

    (chain as Record<string, unknown>).then = (
      resolve: (v: unknown) => void,
      reject: (e: unknown) => void,
    ) => {
      const result = queue.shift() ?? q(null);
      if (result.error) reject(result.error);
      else resolve({ data: result.data, error: null });
    };

    return chain;
  }

  return {
    calls,
    db: {
      from: (table: string) => chainFor(table),
    } as unknown as SupabaseClient,
  };
}

function eqCalls(calls: Call[], table: string): Call[] {
  return calls.filter((call) => call.table === table && call.op === 'eq');
}

describe('createLearningContentRepo', () => {
  it('loads a per-device manifest from subjects', async () => {
    const { db, calls } = createFakeSupabaseClient([
      q([
        {
          device_id: 'dev-1',
          subject_id: 'math',
          title: 'Mathematics',
          metadata_json: { themeId: 'blue' },
          content_source: 'generated',
          created_by_run_id: 'run-1',
          created_at: '2026-05-07T00:00:00Z',
          updated_at: '2026-05-07T00:00:00Z',
        },
      ]),
    ]);
    const repo = createLearningContentRepo(db);

    await expect(repo.getManifest('dev-1')).resolves.toEqual({
      subjects: [
        {
          deviceId: 'dev-1',
          subjectId: 'math',
          title: 'Mathematics',
          metadata: { themeId: 'blue' },
          contentSource: 'generated',
          createdByRunId: 'run-1',
          createdAt: '2026-05-07T00:00:00Z',
          updatedAt: '2026-05-07T00:00:00Z',
        },
      ],
    });
    expect(eqCalls(calls, 'subjects')).toContainEqual({ table: 'subjects', op: 'eq', args: ['device_id', 'dev-1'] });
  });

  it('upserts subjects with backend-owned source metadata', async () => {
    const { db, calls } = createFakeSupabaseClient([q(null)]);
    const repo = createLearningContentRepo(db);

    await repo.upsertSubject({
      deviceId: 'dev-1',
      subjectId: 'physics',
      title: 'Physics',
      metadata: { icon: 'Atom' },
      contentSource: 'manual',
      createdByRunId: null,
    });

    expect(calls.find((call) => call.table === 'subjects' && call.op === 'upsert')?.args[0]).toEqual({
      device_id: 'dev-1',
      subject_id: 'physics',
      title: 'Physics',
      metadata_json: { icon: 'Atom' },
      content_source: 'manual',
      created_by_run_id: null,
    });
  });

  it('reads and writes subject graphs scoped by device and subject', async () => {
    const { db, calls } = createFakeSupabaseClient([
      q({
        device_id: 'dev-1',
        subject_id: 'math',
        graph_json: { nodes: [] },
        content_hash: 'cnt_graph',
        updated_by_run_id: 'run-1',
        updated_at: '2026-05-07T00:00:00Z',
      }),
      q(null),
    ]);
    const repo = createLearningContentRepo(db);

    await expect(repo.getSubjectGraph('dev-1', 'math')).resolves.toMatchObject({
      deviceId: 'dev-1',
      subjectId: 'math',
      graph: { nodes: [] },
      contentHash: 'cnt_graph',
    });
    await repo.putSubjectGraph({
      deviceId: 'dev-1',
      subjectId: 'math',
      graph: { nodes: [{ id: 'n1' }] },
      contentHash: 'cnt_next',
      updatedByRunId: 'run-2',
    });

    expect(eqCalls(calls, 'subject_graphs')).toEqual([
      { table: 'subject_graphs', op: 'eq', args: ['device_id', 'dev-1'] },
      { table: 'subject_graphs', op: 'eq', args: ['subject_id', 'math'] },
    ]);
    expect(calls.find((call) => call.table === 'subject_graphs' && call.op === 'upsert')?.args[0]).toMatchObject({
      device_id: 'dev-1',
      subject_id: 'math',
      graph_json: { nodes: [{ id: 'n1' }] },
      content_hash: 'cnt_next',
      updated_by_run_id: 'run-2',
    });
  });

  it('returns null for missing topic details and propagates storage errors loudly', async () => {
    const { db } = createFakeSupabaseClient([q(null), qErr('database down')]);
    const repo = createLearningContentRepo(db);

    await expect(repo.getTopicDetails('dev-1', 'math', 'limits')).resolves.toBeNull();
    await expect(repo.getTopicDetails('dev-1', 'math', 'limits')).rejects.toThrow('database down');
  });

  it('reads topic cards through the full device subject topic scope', async () => {
    const { db, calls } = createFakeSupabaseClient([
      q([
        {
          device_id: 'dev-1',
          subject_id: 'math',
          topic_id: 'limits',
          card_id: 'card-1',
          card_json: { id: 'card-1', type: 'FLASHCARD' },
          difficulty: 2,
          source_artifact_kind: 'topic-study-cards',
          created_by_run_id: 'run-1',
          created_at: '2026-05-07T00:00:00Z',
        },
      ]),
    ]);
    const repo = createLearningContentRepo(db);

    await expect(repo.getTopicCards('dev-1', 'math', 'limits')).resolves.toEqual([
      {
        deviceId: 'dev-1',
        subjectId: 'math',
        topicId: 'limits',
        cardId: 'card-1',
        card: { id: 'card-1', type: 'FLASHCARD' },
        difficulty: 2,
        sourceArtifactKind: 'topic-study-cards',
        createdByRunId: 'run-1',
        createdAt: '2026-05-07T00:00:00Z',
      },
    ]);
    expect(eqCalls(calls, 'topic_cards')).toEqual([
      { table: 'topic_cards', op: 'eq', args: ['device_id', 'dev-1'] },
      { table: 'topic_cards', op: 'eq', args: ['subject_id', 'math'] },
      { table: 'topic_cards', op: 'eq', args: ['topic_id', 'limits'] },
    ]);
  });

  it('rejects empty topic-card writes instead of silently materializing no content', async () => {
    const { db } = createFakeSupabaseClient([]);
    const repo = createLearningContentRepo(db);

    await expect(
      repo.upsertTopicCards({
        deviceId: 'dev-1',
        subjectId: 'math',
        topicId: 'limits',
        cards: [],
        createdByRunId: 'run-1',
      }),
    ).rejects.toThrow('upsertTopicCards requires at least one row');
  });

  it('upserts and reads crystal trial sets by card-pool hash', async () => {
    const { db, calls } = createFakeSupabaseClient([
      q(null),
      q({
        device_id: 'dev-1',
        subject_id: 'math',
        topic_id: 'limits',
        target_level: 3,
        card_pool_hash: 'pool-1',
        questions_json: { questions: [] },
        content_hash: 'cnt_trial',
        created_by_run_id: 'run-1',
        created_at: '2026-05-07T00:00:00Z',
      }),
    ]);
    const repo = createLearningContentRepo(db);

    await repo.putCrystalTrialSet({
      deviceId: 'dev-1',
      subjectId: 'math',
      topicId: 'limits',
      targetLevel: 3,
      cardPoolHash: 'pool-1',
      questions: { questions: [] },
      contentHash: 'cnt_trial',
      createdByRunId: 'run-1',
    });
    await expect(repo.getCrystalTrialSet('dev-1', 'math', 'limits', 3, 'pool-1')).resolves.toMatchObject({
      deviceId: 'dev-1',
      subjectId: 'math',
      topicId: 'limits',
      targetLevel: 3,
      cardPoolHash: 'pool-1',
      questions: { questions: [] },
      contentHash: 'cnt_trial',
    });

    expect(calls.find((call) => call.table === 'crystal_trial_sets' && call.op === 'upsert')?.args[0]).toMatchObject({
      device_id: 'dev-1',
      subject_id: 'math',
      topic_id: 'limits',
      target_level: 3,
      card_pool_hash: 'pool-1',
    });
    expect(eqCalls(calls, 'crystal_trial_sets')).toEqual([
      { table: 'crystal_trial_sets', op: 'eq', args: ['device_id', 'dev-1'] },
      { table: 'crystal_trial_sets', op: 'eq', args: ['subject_id', 'math'] },
      { table: 'crystal_trial_sets', op: 'eq', args: ['topic_id', 'limits'] },
      { table: 'crystal_trial_sets', op: 'eq', args: ['target_level', 3] },
      { table: 'crystal_trial_sets', op: 'eq', args: ['card_pool_hash', 'pool-1'] },
    ]);
  });
});
