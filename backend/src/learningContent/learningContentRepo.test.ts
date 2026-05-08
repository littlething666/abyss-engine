import { describe, expect, it } from 'vitest';
import { createLearningContentRepo } from './learningContentRepo';
import { createFakeD1, q, qErr } from '../testStubs/fakeD1';

const validSubjectMetadata = {
  subject: { description: 'Math fundamentals', color: '#38bdf8', geometry: { gridTile: 'sphere' } },
};

const validSubjectGraph = {
  subjectId: 'math',
  title: 'Mathematics',
  nodes: [{ topicId: 'limits', title: 'Limits', iconName: 'Sigma', tier: 1, prerequisites: [] }],
};

describe('createLearningContentRepo', () => {
  it('loads a per-device manifest from D1 subjects', async () => {
    const { db, calls } = createFakeD1([q([
      { device_id: 'dev-1', subject_id: 'math', title: 'Mathematics', metadata_json: JSON.stringify(validSubjectMetadata), content_source: 'generated', created_by_run_id: 'run-1', created_at: '2026-05-07T00:00:00Z', updated_at: '2026-05-07T00:00:00Z' },
    ])]);
    await expect(createLearningContentRepo(db).getManifest('dev-1')).resolves.toEqual({
      subjects: [{ deviceId: 'dev-1', subjectId: 'math', title: 'Mathematics', metadata: validSubjectMetadata, contentSource: 'generated', createdByRunId: 'run-1', createdAt: '2026-05-07T00:00:00Z', updatedAt: '2026-05-07T00:00:00Z' }],
    });
    expect(calls[0].args).toContain('dev-1');
  });

  it('upserts subjects with JSON stringification at the D1 boundary', async () => {
    const { db, calls } = createFakeD1([q(null)]);
    const metadata = {
      subject: {
        description: 'Physics fundamentals',
        color: '#38bdf8',
        geometry: { gridTile: 'sphere' },
        topicIds: ['motion'],
        metadata: { icon: 'Atom' },
      },
    };
    await createLearningContentRepo(db).upsertSubject({ deviceId: 'dev-1', subjectId: 'physics', title: 'Physics', metadata, contentSource: 'manual', createdByRunId: null });
    expect(calls[0].args).toEqual(expect.arrayContaining(['dev-1', 'physics', 'Physics', JSON.stringify(metadata), 'manual', null]));
  });

  it('rejects subject writes without the frontend manifest envelope', async () => {
    const { db } = createFakeD1();
    await expect(
      createLearningContentRepo(db).upsertSubject({
        deviceId: 'dev-1',
        subjectId: 'physics',
        title: 'Physics',
        metadata: { icon: 'Atom' },
        contentSource: 'manual',
        createdByRunId: null,
      }),
    ).rejects.toThrow('invalid Learning Content Store subjects.metadata_json');
  });

  it('reads and writes subject graphs scoped by device and subject', async () => {
    const { db, calls } = createFakeD1([
      q({ device_id: 'dev-1', subject_id: 'math', graph_json: JSON.stringify(validSubjectGraph), content_hash: 'cnt_graph', updated_by_run_id: 'run-1', updated_at: '2026-05-07T00:00:00Z' }),
      q(null),
    ]);
    const repo = createLearningContentRepo(db);
    await expect(repo.getSubjectGraph('dev-1', 'math')).resolves.toMatchObject({ deviceId: 'dev-1', subjectId: 'math', graph: validSubjectGraph, contentHash: 'cnt_graph' });
    const nextGraph = { ...validSubjectGraph, nodes: [{ topicId: 'n1', title: 'Node 1', iconName: 'Sigma', tier: 1, prerequisites: [] }] };
    await repo.putSubjectGraph({ deviceId: 'dev-1', subjectId: 'math', graph: nextGraph, contentHash: 'cnt_next', updatedByRunId: 'run-2' });
    expect(calls[0].args).toEqual(['dev-1', 'math']);
    expect(calls[1].args).toEqual(expect.arrayContaining(['dev-1', 'math', JSON.stringify(nextGraph), 'cnt_next', 'run-2']));
  });

  it('returns null for missing topic details and propagates D1 errors loudly', async () => {
    const { db } = createFakeD1([q(null), qErr('database down')]);
    const repo = createLearningContentRepo(db);
    await expect(repo.getTopicDetails('dev-1', 'math', 'limits')).resolves.toBeNull();
    await expect(repo.getTopicDetails('dev-1', 'math', 'limits')).rejects.toThrow('database down');
  });

  it('reads topic cards through the full device subject topic scope', async () => {
    const { db, calls } = createFakeD1([q([
      { device_id: 'dev-1', subject_id: 'math', topic_id: 'limits', card_id: 'card-1', card_json: JSON.stringify({ id: 'card-1', type: 'FLASHCARD' }), difficulty: 2, source_artifact_kind: 'topic-study-cards', created_by_run_id: 'run-1', created_at: '2026-05-07T00:00:00Z' },
    ])]);
    await expect(createLearningContentRepo(db).getTopicCards('dev-1', 'math', 'limits')).resolves.toEqual([
      { deviceId: 'dev-1', subjectId: 'math', topicId: 'limits', cardId: 'card-1', card: { id: 'card-1', type: 'FLASHCARD' }, difficulty: 2, sourceArtifactKind: 'topic-study-cards', createdByRunId: 'run-1', createdAt: '2026-05-07T00:00:00Z' },
    ]);
    expect(calls[0].args).toEqual(['dev-1', 'math', 'limits']);
  });

  it('rejects empty topic-card writes instead of silently materializing no content', async () => {
    const { db } = createFakeD1();
    await expect(createLearningContentRepo(db).upsertTopicCards({ deviceId: 'dev-1', subjectId: 'math', topicId: 'limits', cards: [], createdByRunId: 'run-1' })).rejects.toThrow('upsertTopicCards requires at least one row');
  });

  it('upserts topic cards with a D1 batch', async () => {
    const { db, calls } = createFakeD1([q(null)]);
    await createLearningContentRepo(db).upsertTopicCards({
      deviceId: 'dev-1', subjectId: 'math', topicId: 'limits', createdByRunId: 'run-1',
      cards: [{ cardId: 'card-1', card: { id: 'card-1' }, difficulty: 2, sourceArtifactKind: 'topic-study-cards' }],
    });
    expect(calls[0].args).toEqual(expect.arrayContaining(['dev-1', 'math', 'limits', 'card-1', JSON.stringify({ id: 'card-1' }), 2, 'topic-study-cards', 'run-1']));
  });

  it('upserts and reads crystal trial sets by card-pool hash', async () => {
    const { db, calls } = createFakeD1([
      q(null),
      q({ device_id: 'dev-1', subject_id: 'math', topic_id: 'limits', target_level: 3, card_pool_hash: 'pool-1', questions_json: JSON.stringify({ questions: [] }), content_hash: 'cnt_trial', created_by_run_id: 'run-1', created_at: '2026-05-07T00:00:00Z' }),
    ]);
    const repo = createLearningContentRepo(db);
    await repo.putCrystalTrialSet({ deviceId: 'dev-1', subjectId: 'math', topicId: 'limits', targetLevel: 3, cardPoolHash: 'pool-1', questions: { questions: [] }, contentHash: 'cnt_trial', createdByRunId: 'run-1' });
    await expect(repo.getCrystalTrialSet('dev-1', 'math', 'limits', 3, 'pool-1')).resolves.toMatchObject({ deviceId: 'dev-1', cardPoolHash: 'pool-1', questions: { questions: [] } });
    expect(calls[0].args).toEqual(expect.arrayContaining(['dev-1', 'math', 'limits', 3, 'pool-1', JSON.stringify({ questions: [] }), 'cnt_trial', 'run-1']));
    expect(calls[1].args).toEqual(['dev-1', 'math', 'limits', 3, 'pool-1']);
  });
});
