import { describe, expect, it, vi } from 'vitest';
import { applyArtifactToLearningContent, publishCompleteSubjectGraphToLearningContent } from './artifactApplication';
import type { ILearningContentRepo } from './learningContentRepo';
import type { LearningContentManifest } from './types';
import {
  validateCrystalTrialQuestionsEnvelope,
  validateSubjectGraphEnvelope,
  validateTopicCardEnvelope,
  validateTopicCardRowInvariants,
  validateTopicDetailsEnvelope,
} from './envelopeValidation';

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
    putSubjectGraph: vi.fn(async (input) => {
      validateSubjectGraphEnvelope(input.graph);
    }),
    publishGeneratedSubjectGraph: vi.fn(async (input) => {
      validateSubjectGraphEnvelope(input.graph.graph);
      input.topicDetails.forEach((row) => validateTopicDetailsEnvelope(row.details));
    }),
    getTopicDetails: vi.fn(async () => null),
    putTopicDetails: vi.fn(async (input) => {
      validateTopicDetailsEnvelope(input.details);
    }),
    getTopicContentStatuses: vi.fn(async () => []),
    getTopicCards: vi.fn(async () => []),
    upsertTopicCards: vi.fn(async (input) => {
      input.cards.forEach((card) => {
        validateTopicCardRowInvariants(card.difficulty, card.sourceArtifactKind, card.questionSignature);
        validateTopicCardEnvelope(card.card, {
          cardId: card.cardId,
          conceptId: card.conceptId,
          cardSpecId: card.cardSpecId ?? null,
          miniGameSpecId: card.miniGameSpecId ?? null,
          questionSignature: card.questionSignature,
        });
      });
    }),
    getCrystalTrialSet: vi.fn(async () => null),
    putCrystalTrialSet: vi.fn(async (input) => {
      validateCrystalTrialQuestionsEnvelope(input.questions);
    }),
    ...overrides,
  };
}

describe('applyArtifactToLearningContent', () => {
  it('materializes topic theory without marking study readiness', async () => {
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
      status: 'unavailable',
      updatedByRunId: 'run-1',
      details: expect.objectContaining({
        topicId: 'limits',
        title: 'Limits',
        coreConcept: 'Approach behavior',
        sourceSpans: expect.arrayContaining([
          expect.objectContaining({ kind: 'core-concept', spanId: expect.stringMatching(/^theory_span_[0-9a-f]{64}$/) }),
          expect.objectContaining({ kind: 'theory', spanId: expect.stringMatching(/^theory_span_[0-9a-f]{64}$/) }),
        ]),
      }),
    }));
  });

  it.each([
    'topic-study-cards',
    'topic-expansion-cards',
  ] as const)('materializes deck-compatible %s and omits CLOZE cards from the deck read model', async (artifactKind) => {
    const repo = makeRepo({
      getTopicDetails: vi.fn(async () => ({
        deviceId: 'dev-1',
        subjectId: 'math',
        topicId: 'limits',
        details: { topicId: 'limits', subjectId: 'math', title: 'Limits', coreConcept: 'Limits', theory: 'Theory', keyTakeaways: [] },
        contentHash: 'cnt_details',
        status: 'unavailable',
        updatedByRunId: 'run-details',
        updatedAt: '2026-05-08T00:00:00.000Z',
      })),
    });

    await applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind,
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
        expect.objectContaining({
          cardId: expect.stringMatching(/^card_[0-9a-f]{64}$/),
          conceptId: expect.stringMatching(/^concept_[0-9a-f]{64}$/),
          cardSpecId: expect.stringMatching(/^card_spec_[0-9a-f]{64}$/),
          questionSignature: expect.stringMatching(/^qsig_[0-9a-f]{64}$/),
          difficulty: 1,
          sourceArtifactKind: artifactKind,
        }),
        expect.objectContaining({
          cardId: expect.stringMatching(/^card_[0-9a-f]{64}$/),
          conceptId: expect.stringMatching(/^concept_[0-9a-f]{64}$/),
          cardSpecId: expect.stringMatching(/^card_spec_[0-9a-f]{64}$/),
          questionSignature: expect.stringMatching(/^qsig_[0-9a-f]{64}$/),
          difficulty: 2,
          sourceArtifactKind: artifactKind,
        }),
      ],
    });
  });

  it.each([
    'topic-mini-game-category-sort',
    'topic-mini-game-sequence-build',
    'topic-mini-game-match-pairs',
  ] as const)('materializes %s mini-game cards accepted by LCS schemas', async (artifactKind) => {
    const repo = makeRepo();

    await applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind,
      snapshot: { subject_id: 'math', topic_id: 'limits' },
      contentHash: 'cnt_game',
      payload: {
        cards: [
          { id: 'game-1', topicId: 'limits', difficulty: 2, content: { gameType: 'category-sort', prompt: 'Sort them.' } },
        ],
      },
    });

    expect(repo.upsertTopicCards).toHaveBeenCalledWith(expect.objectContaining({
      cards: [expect.objectContaining({
        cardId: expect.stringMatching(/^card_[0-9a-f]{64}$/),
        conceptId: expect.stringMatching(/^concept_[0-9a-f]{64}$/),
        miniGameSpecId: expect.stringMatching(/^mini_game_spec_[0-9a-f]{64}$/),
        questionSignature: expect.stringMatching(/^qsig_[0-9a-f]{64}$/),
        difficulty: 2,
        sourceArtifactKind: artifactKind,
      })],
    }));
  });

  it('materializes plan-guided study cards with compiled concept and card-spec IDs', async () => {
    const repo = makeRepo({
      getTopicDetails: vi.fn(async () => ({
        deviceId: 'dev-1',
        subjectId: 'math',
        topicId: 'limits',
        details: { topicId: 'limits', subjectId: 'math', title: 'Limits', coreConcept: 'Limits', theory: 'Theory', keyTakeaways: [] },
        contentHash: 'cnt_details',
        status: 'generating',
        updatedByRunId: 'run-details',
        updatedAt: '2026-05-08T00:00:00.000Z',
      })),
    });

    await applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'topic-study-cards',
      snapshot: {
        subject_id: 'math',
        topic_id: 'limits',
        compiled_study_card_specs: [
          {
            concept_id: 'concept_compiled_limits',
            card_spec_id: 'card_spec_compiled_definition',
            card_type: 'FLASHCARD',
            difficulty: 1,
          },
          {
            concept_id: 'concept_compiled_limits',
            card_spec_id: 'card_spec_compiled_delta_epsilon',
            card_type: 'MULTIPLE_CHOICE',
            difficulty: 2,
          },
        ],
      },
      contentHash: 'cnt_cards',
      payload: {
        cards: [
          { id: 'llm-temp-1', topicId: 'limits', type: 'FLASHCARD', difficulty: 1, content: { front: 'What is a limit?', back: 'Approach behavior.' } },
          { id: 'llm-temp-2', topicId: 'limits', type: 'MULTIPLE_CHOICE', difficulty: 2, content: { question: 'Which notation represents a limit?', options: ['lim', 'sum'], correctAnswer: 'lim', explanation: 'Limits use lim notation.' } },
        ],
      },
    });

    expect(repo.upsertTopicCards).toHaveBeenCalledWith(expect.objectContaining({
      cards: [
        expect.objectContaining({
          conceptId: 'concept_compiled_limits',
          cardSpecId: 'card_spec_compiled_definition',
          miniGameSpecId: undefined,
          cardId: expect.stringMatching(/^card_[0-9a-f]{64}$/),
          questionSignature: expect.stringMatching(/^qsig_[0-9a-f]{64}$/),
        }),
        expect.objectContaining({
          conceptId: 'concept_compiled_limits',
          cardSpecId: 'card_spec_compiled_delta_epsilon',
          miniGameSpecId: undefined,
          cardId: expect.stringMatching(/^card_[0-9a-f]{64}$/),
          questionSignature: expect.stringMatching(/^qsig_[0-9a-f]{64}$/),
        }),
      ],
    }));
  });

  it('materializes per-card content with the selected compiled card-spec ID', async () => {
    const repo = makeRepo();

    await applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'topic-card-content',
      snapshot: {
        subject_id: 'math',
        topic_id: 'limits',
        compiled_study_card_specs: [
          {
            concept_id: 'concept_compiled_limits',
            card_spec_id: 'card_spec_compiled_definition',
            card_type: 'FLASHCARD',
            difficulty: 1,
          },
        ],
      },
      contentHash: 'cnt_card',
      payload: {
        card: { id: 'llm-temp-1', topicId: 'limits', type: 'FLASHCARD', difficulty: 1, content: { front: 'What is a limit?', back: 'Approach behavior.' } },
      },
    });

    expect(repo.upsertTopicCards).toHaveBeenCalledWith(expect.objectContaining({
      cards: [expect.objectContaining({
        conceptId: 'concept_compiled_limits',
        cardSpecId: 'card_spec_compiled_definition',
        miniGameSpecId: undefined,
        sourceArtifactKind: 'topic-card-content',
        cardId: expect.stringMatching(/^card_[0-9a-f]{64}$/),
        questionSignature: expect.stringMatching(/^qsig_[0-9a-f]{64}$/),
      })],
    }));
  });

  it('materializes plan-guided mini-game cards with compiled concept and mini-game-spec IDs', async () => {
    const repo = makeRepo();

    await applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'topic-mini-game-category-sort',
      snapshot: {
        subject_id: 'math',
        topic_id: 'limits',
        compiled_mini_game_specs: [
          {
            concept_id: 'concept_compiled_limits',
            mini_game_spec_id: 'mini_game_spec_compiled_categories',
            game_type: 'CATEGORY_SORT',
            difficulty: 2,
          },
        ],
      },
      contentHash: 'cnt_game',
      payload: {
        cards: [
          { id: 'game-1', topicId: 'limits', difficulty: 2, content: { gameType: 'category-sort', prompt: 'Sort examples and non-examples.' } },
        ],
      },
    });

    expect(repo.upsertTopicCards).toHaveBeenCalledWith(expect.objectContaining({
      cards: [expect.objectContaining({
        conceptId: 'concept_compiled_limits',
        cardSpecId: undefined,
        miniGameSpecId: 'mini_game_spec_compiled_categories',
        cardId: expect.stringMatching(/^card_[0-9a-f]{64}$/),
        questionSignature: expect.stringMatching(/^qsig_[0-9a-f]{64}$/),
      })],
    }));
  });

  it('rejects plan-guided study-card artifacts whose output count differs from compiled spec count', async () => {
    const repo = makeRepo();

    await expect(applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'topic-study-cards',
      snapshot: {
        subject_id: 'math',
        topic_id: 'limits',
        compiled_study_card_specs: [
          { concept_id: 'concept_1', card_spec_id: 'card_spec_1', card_type: 'FLASHCARD', difficulty: 1 },
          { concept_id: 'concept_1', card_spec_id: 'card_spec_2', card_type: 'FLASHCARD', difficulty: 1 },
        ],
      },
      contentHash: 'cnt_cards',
      payload: {
        cards: [
          { id: 'llm-1', topicId: 'limits', type: 'FLASHCARD', difficulty: 1, content: { front: 'f', back: 'b' } },
        ],
      },
    })).rejects.toMatchObject({ code: 'validation:semantic-topic-content' });

    expect(repo.upsertTopicCards).not.toHaveBeenCalled();
  });

  it('rejects plan-guided cards whose generated type or difficulty drifts from the compiled spec', async () => {
    const repo = makeRepo();

    await expect(applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'topic-study-cards',
      snapshot: {
        subject_id: 'math',
        topic_id: 'limits',
        compiled_study_card_specs: [
          { concept_id: 'concept_1', card_spec_id: 'card_spec_1', card_type: 'FLASHCARD', difficulty: 1 },
        ],
      },
      contentHash: 'cnt_cards',
      payload: {
        cards: [
          { id: 'llm-1', topicId: 'limits', type: 'MULTIPLE_CHOICE', difficulty: 1, content: { question: 'q', options: ['a', 'b'], correctAnswer: 'a', explanation: 'e' } },
        ],
      },
    })).rejects.toMatchObject({ code: 'validation:semantic-topic-content' });

    expect(repo.upsertTopicCards).not.toHaveBeenCalled();
  });


  it('rejects duplicate question signatures within one generated card artifact', async () => {
    const repo = makeRepo();

    await expect(applyArtifactToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      artifactKind: 'topic-study-cards',
      snapshot: { subject_id: 'math', topic_id: 'limits' },
      contentHash: 'cnt_cards',
      payload: {
        cards: [
          { id: 'llm-1', topicId: 'limits', type: 'FLASHCARD', difficulty: 1, content: { front: 'What is a limit?', back: 'Approach behavior.' } },
          { id: 'llm-2', topicId: 'limits', type: 'FLASHCARD', difficulty: 1, content: { front: ' what is a limit? ', back: 'Approach behavior.' } },
        ],
      },
    })).rejects.toMatchObject({ code: 'validation:semantic-topic-content' });

    expect(repo.upsertTopicCards).not.toHaveBeenCalled();
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

  it('publishes a complete generated subject graph only after topics and prerequisite edges are available', async () => {
    const publishGeneratedSubjectGraph = vi.fn(async () => undefined);
    let graph: Record<string, unknown> | null = null;
    const repo = makeRepo({
      publishGeneratedSubjectGraph: vi.fn(async (input) => {
        validateSubjectGraphEnvelope(input.graph.graph);
        graph = input.graph.graph;
        await publishGeneratedSubjectGraph(input);
      }),
    });

    await publishCompleteSubjectGraphToLearningContent({
      learningContent: repo,
      deviceId: 'dev-1',
      runId: 'run-1',
      snapshot: {
        subject_id: 'math',
        checklist: { topic_name: 'Mathematics' },
        strategy_brief: {
          total_tiers: 2,
          topics_per_tier: 1,
          audience_brief: 'Math subject',
          domain_brief: 'Calculus foundations',
          focus_constraints: 'Beginner friendly',
        },
      },
      topicsContentHash: 'cnt_topics',
      edgesContentHash: 'cnt_edges',
      topicsPayload: { topics: [
        { topicId: 'limits', title: 'Limits', iconName: 'sigma', tier: 1, learningObjective: 'Understand limits' },
        { topicId: 'derivatives', title: 'Derivatives', iconName: 'function-square', tier: 2, learningObjective: 'Understand derivatives' },
      ] },
      edgesPayload: { edges: [{ source: 'limits', target: 'derivatives', minLevel: 2 }] },
    });

    expect(publishGeneratedSubjectGraph).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.objectContaining({
        deviceId: 'dev-1',
        subjectId: 'math',
        title: 'Mathematics',
        contentSource: 'generated',
        createdByRunId: 'run-1',
      }),
    }));
    expect(publishGeneratedSubjectGraph).toHaveBeenCalledTimes(1);
    expect(graph).toMatchObject({
      subjectId: 'math',
      title: 'Mathematics',
      nodes: [
        expect.objectContaining({ topicId: 'limits', prerequisites: [] }),
        expect.objectContaining({ topicId: 'derivatives', prerequisites: [{ topicId: 'limits', minLevel: 2 }] }),
      ],
    });
    expect(publishGeneratedSubjectGraph.mock.calls[0]?.[0].topicDetails).toHaveLength(2);
  });
});
