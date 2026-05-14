import { describe, expect, it } from 'vitest';
import { createArtifactsRepo, type ArtifactObjectStore } from '../repositories/artifactsRepo';
import { createStageCheckpointsRepo } from '../repositories/stageCheckpointsRepo';
import type { ArtifactRow, StageCheckpointRow } from '../repositories/types';
import { createFakeD1, q } from '../testStubs/fakeD1';
import type {
  CompiledTopicCardPlan,
  CompiledTopicConceptSpec,
  TopicCardPlanArtifactPayload,
  TopicConceptPlanArtifactPayload,
} from './topicPlanCompiler';
import {
  loadCompiledTopicCardPlanCheckpoint,
  loadCompiledTopicConceptPlanCheckpoint,
  persistCompiledTopicCardPlanCheckpoint,
  persistCompiledTopicConceptPlanCheckpoint,
  TOPIC_CARD_PLAN_CHECKPOINT_KIND,
  TOPIC_CARD_PLAN_CHECKPOINT_STAGE,
  TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
  TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE,
  TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
  topicConceptPlanCheckpointInputHash,
} from './topicPlanCheckpoints';

function createMemoryObjectStore(): ArtifactObjectStore & { read(key: string): unknown; putJson(key: string, value: unknown): Promise<void> } {
  const objects = new Map<string, string>();
  return {
    async put(key, value) { objects.set(key, value); },
    async get(key) {
      const value = objects.get(key);
      return value === undefined ? null : { text: async () => value };
    },
    read(key) {
      const value = objects.get(key);
      return value === undefined ? undefined : JSON.parse(value);
    },
    async putJson(key, value) {
      objects.set(key, JSON.stringify(value));
    },
  };
}

const compiledConcept: CompiledTopicConceptSpec = {
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

const conceptPlanPayload: TopicConceptPlanArtifactPayload = {
  concepts: [{
    conceptKey: 'limit-definition',
    title: 'Limit definition',
    summary: 'Grounds the informal and formal definition of a limit.',
    sourceSpanIds: ['span_question_1', 'span_theory_1'],
    targetDifficulties: [1, 2],
    priority: 1,
  }],
};

const cardPlanPayload: TopicCardPlanArtifactPayload = {
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
};

const compiledCardPlan: CompiledTopicCardPlan = {
  cardSpecs: [{
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
  miniGameSpecs: [{
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

function stageRow(overrides: Partial<StageCheckpointRow>): StageCheckpointRow {
  return {
    run_id: 'run-1',
    stage: TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE,
    status: 'ready',
    artifact_id: 'art-concepts',
    job_id: null,
    input_hash: 'inp_concepts',
    attempt: 0,
    started_at: '2026-05-12T00:00:00.000Z',
    finished_at: '2026-05-12T00:00:00.000Z',
    error_code: null,
    error_message: null,
    ...overrides,
  };
}

describe('topic planning checkpoints', () => {
  it('persists compiled concept and card plans as ready stage checkpoints', async () => {
    const objectStore = createMemoryObjectStore();
    const { db, calls } = createFakeD1([
      q({ id: 'art-concepts' }),
      q(stageRow({ input_hash: 'inp_concepts' })),
      q({ id: 'art-card-plan' }),
      q(stageRow({ stage: TOPIC_CARD_PLAN_CHECKPOINT_STAGE, artifact_id: 'art-card-plan', input_hash: 'inp_cards' })),
    ]);
    const repos = {
      artifacts: createArtifactsRepo(db, objectStore),
      stageCheckpoints: createStageCheckpointsRepo(db),
    };

    const conceptInputHash = await topicConceptPlanCheckpointInputHash({
      subjectId: 'math',
      topicId: 'limits',
      sourceSpanIds: ['span_question_1', 'span_theory_1'],
      planPayload: conceptPlanPayload,
    });

    const conceptCheckpoint = await persistCompiledTopicConceptPlanCheckpoint({
      repos,
      runId: 'run-1',
      deviceId: 'dev-1',
      subjectId: 'math',
      topicId: 'limits',
      sourceSpanIds: ['span_theory_1', 'span_question_1'],
      planPayload: conceptPlanPayload,
      compiledConcepts: [compiledConcept],
      checkpointInputHash: conceptInputHash,
    });

    const cardCheckpoint = await persistCompiledTopicCardPlanCheckpoint({
      repos,
      runId: 'run-1',
      deviceId: 'dev-1',
      subjectId: 'math',
      topicId: 'limits',
      concepts: [compiledConcept],
      planPayload: cardPlanPayload,
      compiledPlan: compiledCardPlan,
      checkpointInputHash: 'inp_cards',
    });

    expect(conceptCheckpoint).toMatchObject({
      stage: TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE,
      kind: TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
      artifactId: 'art-concepts',
      inputHash: conceptInputHash,
    });
    expect(cardCheckpoint).toMatchObject({
      stage: TOPIC_CARD_PLAN_CHECKPOINT_STAGE,
      kind: TOPIC_CARD_PLAN_CHECKPOINT_KIND,
      artifactId: 'art-card-plan',
      inputHash: 'inp_cards',
    });

    expect(objectStore.read(`abyss/dev-1/${TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND}/${TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION}/${conceptInputHash}.json`)).toMatchObject({
      checkpoint_kind: TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
      compiled_concepts: [{ conceptId: 'concept_backend_owned' }],
      source_span_ids: ['span_question_1', 'span_theory_1'],
    });
    expect(objectStore.read(`abyss/dev-1/${TOPIC_CARD_PLAN_CHECKPOINT_KIND}/${TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION}/inp_cards.json`)).toMatchObject({
      checkpoint_kind: TOPIC_CARD_PLAN_CHECKPOINT_KIND,
      compiled_card_specs: [{ cardSpecId: 'card_spec_backend_owned' }],
      compiled_mini_game_specs: [{ miniGameSpecId: 'mini_game_spec_backend_owned' }],
    });
    expect(calls.filter((call) => call.sql.toLowerCase().includes('insert into stage_checkpoints'))).toHaveLength(2);
  });

  it('loads ready compiled concept checkpoints and ignores stale input hashes', async () => {
    const objectStore = createMemoryObjectStore();
    const payload = {
      checkpoint_kind: TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
      checkpoint_version: TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
      subject_id: 'math',
      topic_id: 'limits',
      source_span_ids: ['span_question_1', 'span_theory_1'],
      plan_payload: conceptPlanPayload,
      compiled_concepts: [compiledConcept],
    };
    await objectStore.putJson('abyss/dev-1/topic-concept-plan-checkpoint/1/inp_concepts.json', payload);

    const artifact: ArtifactRow = {
      id: 'art-concepts',
      device_id: 'dev-1',
      created_by_run_id: 'run-1',
      kind: TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
      input_hash: 'inp_concepts',
      storage_key: 'abyss/dev-1/topic-concept-plan-checkpoint/1/inp_concepts.json',
      content_hash: 'cnt_concepts',
      schema_version: 1,
      created_at: '2026-05-12T00:00:00.000Z',
    };
    const checkpoint = stageRow({ input_hash: 'inp_concepts' });
    const { db: staleDb } = createFakeD1([[checkpoint]].map((value) => q(value)));
    const staleRepos = {
      artifacts: createArtifactsRepo(staleDb, objectStore),
      stageCheckpoints: createStageCheckpointsRepo(staleDb),
    };

    await expect(loadCompiledTopicConceptPlanCheckpoint({
      repos: staleRepos,
      runId: 'run-1',
      expectedInputHash: 'inp_other',
    })).resolves.toBeNull();

    const { db } = createFakeD1([q([checkpoint]), q(artifact)]);
    const repos = {
      artifacts: createArtifactsRepo(db, objectStore),
      stageCheckpoints: createStageCheckpointsRepo(db),
    };

    await expect(loadCompiledTopicConceptPlanCheckpoint({
      repos,
      runId: 'run-1',
      expectedInputHash: 'inp_concepts',
    })).resolves.toMatchObject({
      stage: TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE,
      artifactId: 'art-concepts',
      payload: { compiled_concepts: [{ conceptId: 'concept_backend_owned' }] },
    });
  });

  it('loads ready compiled card-plan checkpoints', async () => {
    const objectStore = createMemoryObjectStore();
    const payload = {
      checkpoint_kind: TOPIC_CARD_PLAN_CHECKPOINT_KIND,
      checkpoint_version: TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
      subject_id: 'math',
      topic_id: 'limits',
      compiled_concept_refs: [{
        concept_id: 'concept_backend_owned',
        concept_key: 'limit-definition',
        source_span_ids: ['span_question_1', 'span_theory_1'],
      }],
      plan_payload: cardPlanPayload,
      compiled_card_specs: compiledCardPlan.cardSpecs,
      compiled_mini_game_specs: compiledCardPlan.miniGameSpecs,
    };
    await objectStore.putJson('abyss/dev-1/topic-card-plan-checkpoint/1/inp_cards.json', payload);

    const artifact: ArtifactRow = {
      id: 'art-card-plan',
      device_id: 'dev-1',
      created_by_run_id: 'run-1',
      kind: TOPIC_CARD_PLAN_CHECKPOINT_KIND,
      input_hash: 'inp_cards',
      storage_key: 'abyss/dev-1/topic-card-plan-checkpoint/1/inp_cards.json',
      content_hash: 'cnt_card_plan',
      schema_version: 1,
      created_at: '2026-05-12T00:00:00.000Z',
    };
    const checkpoint = stageRow({
      stage: TOPIC_CARD_PLAN_CHECKPOINT_STAGE,
      artifact_id: 'art-card-plan',
      input_hash: 'inp_cards',
    });
    const { db } = createFakeD1([q([checkpoint]), q(artifact)]);
    const repos = {
      artifacts: createArtifactsRepo(db, objectStore),
      stageCheckpoints: createStageCheckpointsRepo(db),
    };

    await expect(loadCompiledTopicCardPlanCheckpoint({
      repos,
      runId: 'run-1',
      expectedInputHash: 'inp_cards',
    })).resolves.toMatchObject({
      stage: TOPIC_CARD_PLAN_CHECKPOINT_STAGE,
      artifactId: 'art-card-plan',
      payload: {
        compiled_card_specs: [{ cardSpecId: 'card_spec_backend_owned' }],
        compiled_mini_game_specs: [{ miniGameSpecId: 'mini_game_spec_backend_owned' }],
      },
    });
  });
});
