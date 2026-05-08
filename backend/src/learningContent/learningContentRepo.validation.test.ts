import { describe, expect, it } from 'vitest';
import { createLearningContentRepo } from './learningContentRepo';
import { createFakeD1, q } from '../testStubs/fakeD1';

const validGraph = {
  subjectId: 'math',
  title: 'Mathematics',
  nodes: [{ topicId: 'limits', title: 'Limits', iconName: 'Sigma', tier: 1, prerequisites: [] }],
};

describe('Learning Content Store envelope validation', () => {
  it('rejects malformed persisted subject metadata on read', async () => {
    const { db } = createFakeD1([q([
      { device_id: 'dev-1', subject_id: 'math', title: 'Mathematics', metadata_json: JSON.stringify({ themeId: 'blue' }), content_source: 'generated', created_by_run_id: 'run-1', created_at: '2026-05-07T00:00:00Z', updated_at: '2026-05-07T00:00:00Z' },
    ])]);

    await expect(createLearningContentRepo(db).getManifest('dev-1')).rejects.toMatchObject({ code: 'validation:lcs-envelope' });
  });

  it('rejects malformed subject graph envelopes before write', async () => {
    const { db } = createFakeD1();
    await expect(createLearningContentRepo(db).putSubjectGraph({
      deviceId: 'dev-1',
      subjectId: 'math',
      graph: { nodes: [{ id: 'limits' }] },
      contentHash: 'cnt_graph',
      updatedByRunId: 'run-1',
    })).rejects.toMatchObject({ code: 'validation:lcs-envelope' });
  });

  it('rejects card wrapper mismatches and unknown artifact kinds before write', async () => {
    const { db } = createFakeD1();
    await expect(createLearningContentRepo(db).upsertTopicCards({
      deviceId: 'dev-1',
      subjectId: 'math',
      topicId: 'limits',
      createdByRunId: 'run-1',
      cards: [{ cardId: 'card-1', card: { id: 'other-card' }, difficulty: 2, sourceArtifactKind: 'topic-study-cards' }],
    })).rejects.toMatchObject({ code: 'validation:lcs-envelope' });

    await expect(createLearningContentRepo(db).upsertTopicCards({
      deviceId: 'dev-1',
      subjectId: 'math',
      topicId: 'limits',
      createdByRunId: 'run-1',
      cards: [{ cardId: 'card-1', card: { id: 'card-1' }, difficulty: 2, sourceArtifactKind: 'legacy-kind' }],
    })).rejects.toMatchObject({ code: 'validation:lcs-envelope' });
  });

  it('accepts schema-valid graph, details, card, and crystal trial envelopes', async () => {
    const { db } = createFakeD1([q(null), q(null), q(null), q(null)]);
    const repo = createLearningContentRepo(db);

    await repo.putSubjectGraph({ deviceId: 'dev-1', subjectId: 'math', graph: validGraph, contentHash: 'cnt_graph', updatedByRunId: 'run-1' });
    await repo.putTopicDetails({ deviceId: 'dev-1', subjectId: 'math', topicId: 'limits', details: { topicId: 'limits', title: 'Limits' }, contentHash: 'cnt_details', status: 'ready', updatedByRunId: 'run-1' });
    await repo.upsertTopicCards({ deviceId: 'dev-1', subjectId: 'math', topicId: 'limits', createdByRunId: 'run-1', cards: [{ cardId: 'card-1', card: { id: 'card-1' }, difficulty: 2, sourceArtifactKind: 'topic-study-cards' }] });
    await repo.putCrystalTrialSet({ deviceId: 'dev-1', subjectId: 'math', topicId: 'limits', targetLevel: 3, cardPoolHash: 'pool-1', questions: { questions: [] }, contentHash: 'cnt_trial', createdByRunId: 'run-1' });
  });
});
