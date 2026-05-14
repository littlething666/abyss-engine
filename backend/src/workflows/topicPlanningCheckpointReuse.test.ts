import { describe, expect, it } from 'vitest';
import {
  TOPIC_CARD_PLAN_CHECKPOINT_KIND,
  TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
  TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
  type CompiledTopicConceptSpec,
  type TopicCardPlanCheckpointPayload,
  type TopicConceptPlanCheckpointPayload,
} from '../learningContent';
import {
  isTopicCardPlanCheckpointReusable,
  isTopicConceptPlanCheckpointReusable,
} from './topicPlanningCheckpointReuse';

const concept: CompiledTopicConceptSpec = {
  subjectId: 'math',
  topicId: 'limits',
  conceptId: 'concept_backend_owned',
  conceptKey: 'limit-definition',
  title: 'Limit definition',
  summary: 'Grounds the informal and formal definition of a limit.',
  sourceSpanIds: ['span_theory_1', 'span_question_1'],
  targetDifficulties: [1, 2],
  priority: 1,
};

const conceptCheckpoint: TopicConceptPlanCheckpointPayload = {
  checkpoint_kind: TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
  checkpoint_version: TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
  subject_id: 'math',
  topic_id: 'limits',
  source_span_ids: ['span_question_1', 'span_theory_1'],
  plan_payload: {
    concepts: [{
      conceptKey: 'limit-definition',
      title: 'Limit definition',
      summary: 'Grounds the informal and formal definition of a limit.',
      sourceSpanIds: ['span_question_1', 'span_theory_1'],
      targetDifficulties: [1, 2],
      priority: 1,
    }],
  },
  compiled_concepts: [concept],
};

const cardCheckpoint: TopicCardPlanCheckpointPayload = {
  checkpoint_kind: TOPIC_CARD_PLAN_CHECKPOINT_KIND,
  checkpoint_version: TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
  subject_id: 'math',
  topic_id: 'limits',
  compiled_concept_refs: [{
    concept_id: 'concept_backend_owned',
    concept_key: 'limit-definition',
    source_span_ids: ['span_question_1', 'span_theory_1'],
  }],
  plan_payload: {
    cardSpecs: [{
      cardKey: 'limit-definition-basic',
      conceptKey: 'limit-definition',
      cardType: 'FLASHCARD',
      difficulty: 1,
      prompt: 'Ask for the intuitive meaning of a limit.',
      sourceSpanIds: ['span_theory_1'],
      learningObjective: 'Define a limit informally.',
    }],
    miniGameSpecs: [{
      miniGameKey: 'limit-ordering',
      conceptKey: 'limit-definition',
      gameType: 'SEQUENCE_BUILD',
      difficulty: 2,
      prompt: 'Order the reasoning steps for evaluating a limit.',
      sourceSpanIds: ['span_question_1'],
    }],
  },
  compiled_card_specs: [{
    subjectId: 'math',
    topicId: 'limits',
    cardSpecId: 'card_spec_backend_owned',
    conceptId: 'concept_backend_owned',
    conceptKey: 'limit-definition',
    cardKey: 'limit-definition-basic',
    cardType: 'FLASHCARD',
    difficulty: 1,
    prompt: 'Ask for the intuitive meaning of a limit.',
    sourceSpanIds: ['span_theory_1'],
    learningObjective: 'Define a limit informally.',
  }],
  compiled_mini_game_specs: [{
    subjectId: 'math',
    topicId: 'limits',
    miniGameSpecId: 'mini_game_spec_backend_owned',
    conceptId: 'concept_backend_owned',
    conceptKey: 'limit-definition',
    miniGameKey: 'limit-ordering',
    gameType: 'SEQUENCE_BUILD',
    difficulty: 2,
    prompt: 'Order the reasoning steps for evaluating a limit.',
    sourceSpanIds: ['span_question_1'],
  }],
};

describe('topic planning checkpoint reuse guards', () => {
  it('allows concept-plan checkpoint reuse when scope and source spans match independent of order', () => {
    expect(isTopicConceptPlanCheckpointReusable({
      checkpoint: conceptCheckpoint,
      subjectId: 'math',
      topicId: 'limits',
      sourceSpanIds: ['span_theory_1', 'span_question_1'],
    })).toBe(true);
  });

  it('rejects concept-plan checkpoint reuse for stale source spans or scope drift', () => {
    expect(isTopicConceptPlanCheckpointReusable({
      checkpoint: conceptCheckpoint,
      subjectId: 'math',
      topicId: 'derivatives',
      sourceSpanIds: ['span_theory_1', 'span_question_1'],
    })).toBe(false);

    expect(isTopicConceptPlanCheckpointReusable({
      checkpoint: conceptCheckpoint,
      subjectId: 'math',
      topicId: 'limits',
      sourceSpanIds: ['span_theory_1', 'span_question_2'],
    })).toBe(false);
  });

  it('allows card-plan checkpoint reuse when compiled concept refs match independent of source-span order', () => {
    expect(isTopicCardPlanCheckpointReusable({
      checkpoint: cardCheckpoint,
      subjectId: 'math',
      topicId: 'limits',
      concepts: [{ ...concept, sourceSpanIds: ['span_theory_1', 'span_question_1'] }],
    })).toBe(true);
  });

  it('rejects card-plan checkpoint reuse when compiled concept refs are stale', () => {
    expect(isTopicCardPlanCheckpointReusable({
      checkpoint: cardCheckpoint,
      subjectId: 'math',
      topicId: 'limits',
      concepts: [{ ...concept, conceptId: 'concept_changed' }],
    })).toBe(false);

    expect(isTopicCardPlanCheckpointReusable({
      checkpoint: cardCheckpoint,
      subjectId: 'math',
      topicId: 'limits',
      concepts: [{ ...concept, sourceSpanIds: ['span_theory_1', 'span_question_2'] }],
    })).toBe(false);
  });
});
