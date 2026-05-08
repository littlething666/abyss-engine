import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATION_POLICY } from '../generationPolicy/defaultPolicy';
import { assertNoForbiddenPolicyFields, expandRunIntent } from './runIntentExpansion';
import type { ILearningContentRepo } from '../learningContent/learningContentRepo';
import type { LearningContentSubject, TopicCardContent, TopicDetailsContent } from '../learningContent/types';

const DEVICE_ID = '00000000-0000-0000-0000-000000000001';
const NOW = new Date('2026-05-07T00:00:00.000Z');

function subject(): LearningContentSubject {
  return {
    deviceId: DEVICE_ID,
    subjectId: 'math',
    title: 'Mathematics',
    metadata: {
      subject: {
        description: 'Math subject',
        color: '#ffffff',
        geometry: { gridTile: 'box' },
        metadata: {
          strategy: { content: { contentBrief: 'Use intuitive explanations.' } },
        },
      },
    },
    contentSource: 'generated',
    createdByRunId: 'run-0',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function topicDetails(): TopicDetailsContent {
  return {
    deviceId: DEVICE_ID,
    subjectId: 'math',
    topicId: 'limits',
    status: 'ready',
    contentHash: 'cnt_details',
    updatedByRunId: 'run-details',
    updatedAt: NOW.toISOString(),
    details: {
      topicId: 'limits',
      subjectId: 'math',
      title: 'Limits',
      coreConcept: 'Approach behavior',
      theory: 'Limits describe the value a function approaches.',
      keyTakeaways: ['Limits capture approach behavior.'],
      coreQuestionsByDifficulty: {
        1: ['What is a limit?'],
        2: ['How do one-sided limits compare?'],
        3: ['When does a limit not exist?'],
        4: ['How do epsilon-delta proofs work?'],
      },
      groundingSources: [{ title: 'Calculus text', url: 'https://example.test', retrievedAt: NOW.toISOString(), trustLevel: 'high' }],
    },
  };
}

function topicCards(): TopicCardContent[] {
  return [
    {
      deviceId: DEVICE_ID,
      subjectId: 'math',
      topicId: 'limits',
      cardId: 'card-1',
      difficulty: 3,
      sourceArtifactKind: 'topic-study-cards',
      createdByRunId: 'run-cards',
      createdAt: NOW.toISOString(),
      card: {
        id: 'card-1',
        type: 'FLASHCARD',
        difficulty: 3,
        content: { front: 'Limit', back: 'Approached value' },
      },
    },
  ];
}

function repo(): ILearningContentRepo {
  return {
    getManifest: async () => ({ subjects: [subject()] }),
    upsertSubject: async () => undefined,
    getSubjectGraph: async () => ({
      deviceId: DEVICE_ID,
      subjectId: 'math',
      contentHash: 'cnt_graph',
      updatedByRunId: 'run-graph',
      updatedAt: NOW.toISOString(),
      graph: {
        subjectId: 'math',
        title: 'Mathematics',
        themeId: 'blue',
        maxTier: 1,
        nodes: [{ topicId: 'limits', title: 'Limits', learningObjective: 'Understand limits', tier: 1, prerequisites: [], iconName: 'book-open' }],
      },
    }),
    putSubjectGraph: async () => undefined,
    getTopicDetails: async () => topicDetails(),
    putTopicDetails: async () => undefined,
    getTopicCards: async () => topicCards(),
    upsertTopicCards: async () => undefined,
    getCrystalTrialSet: async () => null,
    putCrystalTrialSet: async () => undefined,
  };
}

describe('assertNoForbiddenPolicyFields', () => {
  it('rejects generation policy fields at any depth', () => {
    expect(() => assertNoForbiddenPolicyFields({ kind: 'topic-content', intent: { nested: [{ model_id: 'x' }] } })).toThrow(
      'body.intent.nested[0].model_id',
    );
    expect(() => assertNoForbiddenPolicyFields({ intent: { response_format: {} } })).toThrow(
      'body.intent.response_format',
    );
  });
});

describe('expandRunIntent', () => {
  it('expands topic expansion intent from Learning Content rows and backend policy', async () => {
    const expanded = await expandRunIntent({
      deviceId: DEVICE_ID,
      kind: 'topic-expansion',
      intent: { subjectId: 'math', topicId: 'limits', nextLevel: 2 },
      learningContent: repo(),
      now: () => NOW,
    });

    expect(expanded).toMatchObject({ kind: 'topic-expansion', subjectId: 'math', topicId: 'limits' });
    expect(expanded.snapshot).toMatchObject({
      pipeline_kind: 'topic-expansion-cards',
      subject_id: 'math',
      topic_id: 'limits',
      next_level: 2,
      difficulty: 3,
      captured_at: NOW.toISOString(),
      syllabus_questions: ['When does a limit not exist?'],
      existing_card_ids: ['card-1'],
      provider_healing_requested: true,
    });
    expect(expanded.snapshot.model_id).toBe(DEFAULT_GENERATION_POLICY.jobs['topic-expansion-cards'].modelId);
    expect(expanded.snapshot.generation_policy_hash).toMatch(/^gpol_[0-9a-f]{64}$/);
  });

  it('expands crystal trial card pool hash from Learning Content cards', async () => {
    const expanded = await expandRunIntent({
      deviceId: DEVICE_ID,
      kind: 'crystal-trial',
      intent: { subjectId: 'math', topicId: 'limits', currentLevel: 2 },
      learningContent: repo(),
      now: () => NOW,
    });

    expect(expanded.snapshot).toMatchObject({
      pipeline_kind: 'crystal-trial',
      subject_id: 'math',
      topic_id: 'limits',
      current_level: 2,
      target_level: 3,
      question_count: 5,
      content_brief: 'Use intuitive explanations.',
      provider_healing_requested: true,
    });
    expect(expanded.snapshot.card_pool_hash).toMatch(/^cnt_[0-9a-f]{64}$/);
  });
});
