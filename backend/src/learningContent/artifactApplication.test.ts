import { describe, expect, it, vi } from 'vitest';
import { applyArtifactToLearningContent } from './artifactApplication';
import type { ILearningContentRepo } from './learningContentRepo';
import type { LearningContentManifest } from './types';

function makeRepo(overrides: Partial<ILearningContentRepo> = {}): ILearningContentRepo {
  const manifest: LearningContentManifest = {
    subjects: [{
      deviceId: 'dev-1',
      subjectId: 'math',
      title: 'Mathematics',
      metadata: {
        subject: {
          description: 'Math subject',
          color: '#fff',
          geometry: { gridTile: 'box' },
        },
      },
      contentSource: 'generated',
      createdByRunId: 'run-seed',
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
    }],
  };
  return {
    getManifest: vi.fn(async () => manifest),
    upsertSubject: vi.fn(async () => undefined),
    getSubjectGraph: vi.fn(async () => null),
    putSubjectGraph: vi.fn(async () => undefined),
    getTopicDetails: vi.fn(async () => null),
    putTopicDetails: vi.fn(async () => undefined),
    getTopicCards: vi.fn(async () => []),
    upsertTopicCards: vi.fn(async () => undefined),
    getCrystalTrialSet: vi.fn(async () => null),
    putCrystalTrialSet: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('applyArtifactToLearningContent', () => {
  it('materializes topic theory into ready topic details', async () => {
    const repo = makeRepo();

    await applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'topic-theory',
      snapshot: { subject_id: 'math', topic_id: 'limits', topic_title: 'Limits' },
      contentHash: 'cnt_theory',
      payload: {
        coreConcept: 'Approach behavior',
        theory: 'Limits describe approach behavior.',
        keyTakeaways: ['a', 'b', 'c', 'd'],
        coreQuestionsByDifficulty: { '1': ['q1'], '2': ['q2'], '3': ['q3'], '4': ['q4'] },
      },
    });

    expect(repo.putTopicDetails).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: 'dev-1',
      subjectId: 'math',
      topicId: 'limits',
      contentHash: 'cnt_theory',
      status: 'ready',
      updatedByRunId: 'run-1',
      details: expect.objectContaining({ topicId: 'limits', title: 'Limits', coreConcept: 'Approach behavior' }),
    }));
  });

  it('materializes deck-compatible study cards and omits CLOZE cards from the deck read model', async () => {
    const repo = makeRepo();

    await applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'topic-study-cards',
      snapshot: { subject_id: 'math', topic_id: 'limits' },
      contentHash: 'cnt_cards',
      payload: {
        cards: [
          { id: 'flash-1', topicId: 'limits', type: 'FLASHCARD', difficulty: 1, content: { front: 'f', back: 'b' } },
          { id: 'cloze-1', topicId: 'limits', type: 'CLOZE', difficulty: 1, content: { text: 'x' } },
          { id: 'mc-1', topicId: 'limits', type: 'MULTIPLE_CHOICE', difficulty: 2, content: { question: 'q', options: ['a', 'b'], correctAnswer: 'a', explanation: 'e' } },
        ],
      },
    });

    expect(repo.upsertTopicCards).toHaveBeenCalledWith({
      deviceId: 'dev-1',
      subjectId: 'math',
      topicId: 'limits',
      createdByRunId: 'run-1',
      cards: [
        expect.objectContaining({ cardId: 'flash-1', difficulty: 1, sourceArtifactKind: 'topic-study-cards' }),
        expect.objectContaining({ cardId: 'mc-1', difficulty: 2, sourceArtifactKind: 'topic-study-cards' }),
      ],
    });
  });

  it('materializes crystal trial sets under the snapshot target level and card-pool hash', async () => {
    const repo = makeRepo();

    await applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'crystal-trial',
      snapshot: { subject_id: 'math', topic_id: 'limits', target_level: 2, card_pool_hash: 'pool-1' },
      contentHash: 'cnt_trial',
      payload: { questions: [{ id: 'q1' }] },
    });

    expect(repo.putCrystalTrialSet).toHaveBeenCalledWith({
      deviceId: 'dev-1',
      subjectId: 'math',
      topicId: 'limits',
      targetLevel: 2,
      cardPoolHash: 'pool-1',
      questions: { questions: [{ id: 'q1' }] },
      contentHash: 'cnt_trial',
      createdByRunId: 'run-1',
    });
  });

  it('materializes subject graph topics and then prerequisite edges', async () => {
    const putSubjectGraph = vi.fn(async () => undefined);
    const putTopicDetails = vi.fn(async () => undefined);
    let graph: Record<string, unknown> | null = null;
    const repo = makeRepo({
      putSubjectGraph: vi.fn(async (input) => {
        graph = input.graph;
        await putSubjectGraph(input);
      }),
      getSubjectGraph: vi.fn(async () => graph ? {
        deviceId: 'dev-1', subjectId: 'math', graph, contentHash: 'cnt_graph', updatedByRunId: 'run-1', updatedAt: 'now',
      } : null),
      putTopicDetails,
    });

    await applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'subject-graph-topics',
      snapshot: { subject_id: 'math' },
      contentHash: 'cnt_topics',
      payload: { topics: [
        { topicId: 'limits', title: 'Limits', iconName: 'sigma', tier: 1, learningObjective: 'Understand limits' },
        { topicId: 'derivatives', title: 'Derivatives', iconName: 'function-square', tier: 2, learningObjective: 'Understand derivatives' },
      ] },
    });

    await applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'subject-graph-edges',
      snapshot: { subject_id: 'math' },
      contentHash: 'cnt_edges',
      payload: { edges: [{ source: 'limits', target: 'derivatives', minLevel: 2 }] },
    });

    expect(putSubjectGraph).toHaveBeenCalledTimes(2);
    expect(graph).toMatchObject({
      subjectId: 'math',
      title: 'Mathematics',
      nodes: [
        expect.objectContaining({ topicId: 'limits', prerequisites: [] }),
        expect.objectContaining({ topicId: 'derivatives', prerequisites: [{ topicId: 'limits', minLevel: 2 }] }),
      ],
    });
    expect(putTopicDetails).toHaveBeenCalledTimes(2);
  });
});
