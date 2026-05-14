import { contentHash, inputHash } from '../contracts/generationContracts';
import { WorkflowFail } from '../lib/workflowErrors';
import type { IArtifactsRepo } from '../repositories/artifactsRepo';
import type { IStageCheckpointsRepo } from '../repositories/stageCheckpointsRepo';
import type { StageCheckpointRow } from '../repositories/types';
import type {
  CompiledTopicCardPlan,
  CompiledTopicCardSpec,
  CompiledTopicConceptSpec,
  CompiledTopicMiniGameSpec,
  TopicCardPlanArtifactPayload,
  TopicConceptPlanArtifactPayload,
} from './topicPlanCompiler';

export const TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND = 'topic-concept-plan-checkpoint' as const;
export const TOPIC_CARD_PLAN_CHECKPOINT_KIND = 'topic-card-plan-checkpoint' as const;
export const TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE = 'planning:concepts' as const;
export const TOPIC_CARD_PLAN_CHECKPOINT_STAGE = 'planning:card-specs' as const;
export const TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION = 1 as const;

export type TopicPlanCheckpointKind =
  | typeof TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND
  | typeof TOPIC_CARD_PLAN_CHECKPOINT_KIND;

export interface TopicPlanCheckpointRepos {
  artifacts: Pick<IArtifactsRepo, 'putStorage' | 'get' | 'getStorage'>;
  stageCheckpoints: Pick<IStageCheckpointsRepo, 'byRun' | 'upsert'>;
}

export interface TopicConceptPlanCheckpointPayload {
  checkpoint_kind: typeof TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND;
  checkpoint_version: typeof TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION;
  subject_id: string;
  topic_id: string;
  source_span_ids: string[];
  plan_payload: TopicConceptPlanArtifactPayload;
  compiled_concepts: CompiledTopicConceptSpec[];
}

export interface TopicCardPlanCheckpointPayload {
  checkpoint_kind: typeof TOPIC_CARD_PLAN_CHECKPOINT_KIND;
  checkpoint_version: typeof TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION;
  subject_id: string;
  topic_id: string;
  compiled_concept_refs: Array<{
    concept_id: string;
    concept_key: string;
    source_span_ids: string[];
  }>;
  plan_payload: TopicCardPlanArtifactPayload;
  compiled_card_specs: CompiledTopicCardSpec[];
  compiled_mini_game_specs: CompiledTopicMiniGameSpec[];
}

export interface PersistTopicConceptPlanCheckpointInput {
  repos: TopicPlanCheckpointRepos;
  runId: string;
  deviceId: string;
  subjectId: string;
  topicId: string;
  sourceSpanIds: readonly string[];
  planPayload: TopicConceptPlanArtifactPayload;
  compiledConcepts: readonly CompiledTopicConceptSpec[];
  checkpointInputHash?: string;
}

export interface PersistTopicCardPlanCheckpointInput {
  repos: TopicPlanCheckpointRepos;
  runId: string;
  deviceId: string;
  subjectId: string;
  topicId: string;
  concepts: readonly CompiledTopicConceptSpec[];
  planPayload: TopicCardPlanArtifactPayload;
  compiledPlan: CompiledTopicCardPlan;
  checkpointInputHash?: string;
}

export interface PersistedTopicPlanCheckpoint<TPayload> {
  stage: typeof TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE | typeof TOPIC_CARD_PLAN_CHECKPOINT_STAGE;
  kind: TopicPlanCheckpointKind;
  artifactId: string;
  inputHash: string;
  contentHash: string;
  payload: TPayload;
}

export interface LoadTopicPlanCheckpointInput {
  repos: TopicPlanCheckpointRepos;
  runId: string;
  expectedInputHash?: string;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be a non-empty string`);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be an array`);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be an integer`);
  }
  return value as number;
}

function requireStringArray(value: unknown, label: string): string[] {
  return requireArray(value, label).map((entry, index) => requireNonEmptyString(entry, `${label}[${index}]`));
}

function normalizeUniqueSortedStrings(values: readonly string[], label: string): string[] {
  const normalized = values.map((value, index) => requireNonEmptyString(value, `${label}[${index}]`).trim());
  const unique = [...new Set(normalized)].sort();
  if (unique.length === 0) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must contain at least one value`);
  }
  return unique;
}

function assertCheckpointScope(subjectId: string, topicId: string, record: { subjectId: string; topicId: string }, label: string): void {
  if (record.subjectId !== subjectId || record.topicId !== topicId) {
    throw new WorkflowFail(
      'validation:semantic-topic-content',
      `${label} must belong to subject ${subjectId} and topic ${topicId}`,
    );
  }
}

function stableConceptRefs(concepts: readonly CompiledTopicConceptSpec[]): TopicCardPlanCheckpointPayload['compiled_concept_refs'] {
  return [...concepts]
    .map((concept) => ({
      concept_id: concept.conceptId,
      concept_key: concept.conceptKey,
      source_span_ids: normalizeUniqueSortedStrings(concept.sourceSpanIds, `concept ${concept.conceptKey}.sourceSpanIds`),
    }))
    .sort((a, b) => a.concept_key.localeCompare(b.concept_key) || a.concept_id.localeCompare(b.concept_id));
}

function buildTopicConceptPlanCheckpointPayload(input: PersistTopicConceptPlanCheckpointInput): TopicConceptPlanCheckpointPayload {
  const subjectId = requireNonEmptyString(input.subjectId, 'subjectId');
  const topicId = requireNonEmptyString(input.topicId, 'topicId');
  if (input.compiledConcepts.length === 0) {
    throw new WorkflowFail('validation:semantic-topic-content', 'compiledConcepts must contain at least one concept');
  }

  const compiledConcepts = input.compiledConcepts.map((concept, index) => {
    assertCheckpointScope(subjectId, topicId, concept, `compiledConcepts[${index}]`);
    return { ...concept, sourceSpanIds: normalizeUniqueSortedStrings(concept.sourceSpanIds, `compiledConcepts[${index}].sourceSpanIds`) };
  });

  return {
    checkpoint_kind: TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
    checkpoint_version: TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
    subject_id: subjectId,
    topic_id: topicId,
    source_span_ids: normalizeUniqueSortedStrings(input.sourceSpanIds, 'sourceSpanIds'),
    plan_payload: input.planPayload,
    compiled_concepts: compiledConcepts,
  };
}

function buildTopicCardPlanCheckpointPayload(input: PersistTopicCardPlanCheckpointInput): TopicCardPlanCheckpointPayload {
  const subjectId = requireNonEmptyString(input.subjectId, 'subjectId');
  const topicId = requireNonEmptyString(input.topicId, 'topicId');
  if (input.concepts.length === 0) {
    throw new WorkflowFail('validation:semantic-topic-content', 'concepts must contain at least one compiled concept');
  }
  if (input.compiledPlan.cardSpecs.length === 0) {
    throw new WorkflowFail('validation:semantic-topic-content', 'compiledPlan.cardSpecs must contain at least one card spec');
  }

  for (const [index, concept] of input.concepts.entries()) {
    assertCheckpointScope(subjectId, topicId, concept, `concepts[${index}]`);
  }

  const cardSpecs = input.compiledPlan.cardSpecs.map((spec, index) => {
    assertCheckpointScope(subjectId, topicId, spec, `compiledPlan.cardSpecs[${index}]`);
    return { ...spec, sourceSpanIds: normalizeUniqueSortedStrings(spec.sourceSpanIds, `compiledPlan.cardSpecs[${index}].sourceSpanIds`) };
  });
  const miniGameSpecs = input.compiledPlan.miniGameSpecs.map((spec, index) => {
    assertCheckpointScope(subjectId, topicId, spec, `compiledPlan.miniGameSpecs[${index}]`);
    return { ...spec, sourceSpanIds: normalizeUniqueSortedStrings(spec.sourceSpanIds, `compiledPlan.miniGameSpecs[${index}].sourceSpanIds`) };
  });

  return {
    checkpoint_kind: TOPIC_CARD_PLAN_CHECKPOINT_KIND,
    checkpoint_version: TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
    subject_id: subjectId,
    topic_id: topicId,
    compiled_concept_refs: stableConceptRefs(input.concepts),
    plan_payload: input.planPayload,
    compiled_card_specs: cardSpecs,
    compiled_mini_game_specs: miniGameSpecs,
  };
}

export async function topicConceptPlanCheckpointInputHash(input: {
  subjectId: string;
  topicId: string;
  sourceSpanIds: readonly string[];
  planPayload: TopicConceptPlanArtifactPayload;
}): Promise<string> {
  return inputHash({
    checkpoint_kind: TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
    checkpoint_version: TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
    subject_id: requireNonEmptyString(input.subjectId, 'subjectId'),
    topic_id: requireNonEmptyString(input.topicId, 'topicId'),
    source_span_ids: normalizeUniqueSortedStrings(input.sourceSpanIds, 'sourceSpanIds'),
    plan_payload: input.planPayload,
  });
}

export async function topicCardPlanCheckpointInputHash(input: {
  subjectId: string;
  topicId: string;
  concepts: readonly CompiledTopicConceptSpec[];
  planPayload: TopicCardPlanArtifactPayload;
}): Promise<string> {
  return inputHash({
    checkpoint_kind: TOPIC_CARD_PLAN_CHECKPOINT_KIND,
    checkpoint_version: TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
    subject_id: requireNonEmptyString(input.subjectId, 'subjectId'),
    topic_id: requireNonEmptyString(input.topicId, 'topicId'),
    compiled_concept_refs: stableConceptRefs(input.concepts),
    plan_payload: input.planPayload,
  });
}

async function persistCheckpoint<TPayload>(input: {
  repos: TopicPlanCheckpointRepos;
  runId: string;
  deviceId: string;
  stage: typeof TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE | typeof TOPIC_CARD_PLAN_CHECKPOINT_STAGE;
  kind: TopicPlanCheckpointKind;
  inputHash: string;
  payload: TPayload;
}): Promise<PersistedTopicPlanCheckpoint<TPayload>> {
  const _contentHash = await contentHash(input.payload);
  const artifactId = await input.repos.artifacts.putStorage(
    { deviceId: input.deviceId, kind: input.kind, inputHash: input.inputHash, payload: input.payload },
    _contentHash,
    TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
    input.runId,
  );
  const now = new Date().toISOString();
  await input.repos.stageCheckpoints.upsert({
    runId: input.runId,
    stage: input.stage,
    status: 'ready',
    inputHash: input.inputHash,
    attempt: 0,
    artifactId,
    startedAt: now,
    finishedAt: now,
  });

  return {
    stage: input.stage,
    kind: input.kind,
    artifactId,
    inputHash: input.inputHash,
    contentHash: _contentHash,
    payload: input.payload,
  };
}

export async function persistCompiledTopicConceptPlanCheckpoint(
  input: PersistTopicConceptPlanCheckpointInput,
): Promise<PersistedTopicPlanCheckpoint<TopicConceptPlanCheckpointPayload>> {
  const payload = buildTopicConceptPlanCheckpointPayload(input);
  const checkpointInputHash = input.checkpointInputHash ?? await topicConceptPlanCheckpointInputHash({
    subjectId: input.subjectId,
    topicId: input.topicId,
    sourceSpanIds: input.sourceSpanIds,
    planPayload: input.planPayload,
  });
  return persistCheckpoint({
    repos: input.repos,
    runId: input.runId,
    deviceId: input.deviceId,
    stage: TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE,
    kind: TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
    inputHash: checkpointInputHash,
    payload,
  });
}

export async function persistCompiledTopicCardPlanCheckpoint(
  input: PersistTopicCardPlanCheckpointInput,
): Promise<PersistedTopicPlanCheckpoint<TopicCardPlanCheckpointPayload>> {
  const payload = buildTopicCardPlanCheckpointPayload(input);
  const checkpointInputHash = input.checkpointInputHash ?? await topicCardPlanCheckpointInputHash({
    subjectId: input.subjectId,
    topicId: input.topicId,
    concepts: input.concepts,
    planPayload: input.planPayload,
  });
  return persistCheckpoint({
    repos: input.repos,
    runId: input.runId,
    deviceId: input.deviceId,
    stage: TOPIC_CARD_PLAN_CHECKPOINT_STAGE,
    kind: TOPIC_CARD_PLAN_CHECKPOINT_KIND,
    inputHash: checkpointInputHash,
    payload,
  });
}

function findReadyCheckpoint(
  checkpoints: readonly StageCheckpointRow[],
  stage: typeof TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE | typeof TOPIC_CARD_PLAN_CHECKPOINT_STAGE,
  expectedInputHash?: string,
): StageCheckpointRow | null {
  const checkpoint = checkpoints.find((candidate) => (
    candidate.stage === stage
    && candidate.status === 'ready'
    && typeof candidate.artifact_id === 'string'
    && candidate.artifact_id.length > 0
  ));
  if (!checkpoint) return null;
  if (expectedInputHash !== undefined && checkpoint.input_hash !== expectedInputHash) return null;
  return checkpoint;
}

function validateCompiledConcept(value: unknown, label: string): CompiledTopicConceptSpec {
  const record = requireRecord(value, label);
  return {
    subjectId: requireNonEmptyString(record.subjectId, `${label}.subjectId`),
    topicId: requireNonEmptyString(record.topicId, `${label}.topicId`),
    conceptId: requireNonEmptyString(record.conceptId, `${label}.conceptId`),
    conceptKey: requireNonEmptyString(record.conceptKey, `${label}.conceptKey`),
    title: requireNonEmptyString(record.title, `${label}.title`),
    summary: requireNonEmptyString(record.summary, `${label}.summary`),
    sourceSpanIds: requireStringArray(record.sourceSpanIds, `${label}.sourceSpanIds`),
    targetDifficulties: requireArray(record.targetDifficulties, `${label}.targetDifficulties`).map((entry, index) => requireNumber(entry, `${label}.targetDifficulties[${index}]`)),
    priority: requireNumber(record.priority, `${label}.priority`),
  };
}

function validateCompiledCardSpec(value: unknown, label: string): CompiledTopicCardSpec {
  const record = requireRecord(value, label);
  const out: CompiledTopicCardSpec = {
    subjectId: requireNonEmptyString(record.subjectId, `${label}.subjectId`),
    topicId: requireNonEmptyString(record.topicId, `${label}.topicId`),
    cardSpecId: requireNonEmptyString(record.cardSpecId, `${label}.cardSpecId`),
    conceptId: requireNonEmptyString(record.conceptId, `${label}.conceptId`),
    conceptKey: requireNonEmptyString(record.conceptKey, `${label}.conceptKey`),
    cardKey: requireNonEmptyString(record.cardKey, `${label}.cardKey`),
    cardType: requireNonEmptyString(record.cardType, `${label}.cardType`) as CompiledTopicCardSpec['cardType'],
    difficulty: requireNumber(record.difficulty, `${label}.difficulty`),
    prompt: requireNonEmptyString(record.prompt, `${label}.prompt`),
    sourceSpanIds: requireStringArray(record.sourceSpanIds, `${label}.sourceSpanIds`),
  };
  if (record.learningObjective !== undefined) out.learningObjective = requireNonEmptyString(record.learningObjective, `${label}.learningObjective`);
  return out;
}

function validateCompiledMiniGameSpec(value: unknown, label: string): CompiledTopicMiniGameSpec {
  const record = requireRecord(value, label);
  const out: CompiledTopicMiniGameSpec = {
    subjectId: requireNonEmptyString(record.subjectId, `${label}.subjectId`),
    topicId: requireNonEmptyString(record.topicId, `${label}.topicId`),
    miniGameSpecId: requireNonEmptyString(record.miniGameSpecId, `${label}.miniGameSpecId`),
    conceptId: requireNonEmptyString(record.conceptId, `${label}.conceptId`),
    conceptKey: requireNonEmptyString(record.conceptKey, `${label}.conceptKey`),
    miniGameKey: requireNonEmptyString(record.miniGameKey, `${label}.miniGameKey`),
    gameType: requireNonEmptyString(record.gameType, `${label}.gameType`) as CompiledTopicMiniGameSpec['gameType'],
    difficulty: requireNumber(record.difficulty, `${label}.difficulty`),
    prompt: requireNonEmptyString(record.prompt, `${label}.prompt`),
    sourceSpanIds: requireStringArray(record.sourceSpanIds, `${label}.sourceSpanIds`),
  };
  if (record.learningObjective !== undefined) out.learningObjective = requireNonEmptyString(record.learningObjective, `${label}.learningObjective`);
  return out;
}

function validateConceptCheckpointPayload(value: unknown): TopicConceptPlanCheckpointPayload {
  const record = requireRecord(value, TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND);
  if (record.checkpoint_kind !== TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND) {
    throw new WorkflowFail('precondition:missing-topic', `checkpoint artifact kind must be ${TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND}`);
  }
  if (record.checkpoint_version !== TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION) {
    throw new WorkflowFail('precondition:missing-topic', `checkpoint artifact version must be ${TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION}`);
  }
  return {
    checkpoint_kind: TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
    checkpoint_version: TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
    subject_id: requireNonEmptyString(record.subject_id, 'checkpoint.subject_id'),
    topic_id: requireNonEmptyString(record.topic_id, 'checkpoint.topic_id'),
    source_span_ids: requireStringArray(record.source_span_ids, 'checkpoint.source_span_ids'),
    plan_payload: requireRecord(record.plan_payload, 'checkpoint.plan_payload') as TopicConceptPlanArtifactPayload,
    compiled_concepts: requireArray(record.compiled_concepts, 'checkpoint.compiled_concepts').map((entry, index) => validateCompiledConcept(entry, `checkpoint.compiled_concepts[${index}]`)),
  };
}

function validateCardCheckpointPayload(value: unknown): TopicCardPlanCheckpointPayload {
  const record = requireRecord(value, TOPIC_CARD_PLAN_CHECKPOINT_KIND);
  if (record.checkpoint_kind !== TOPIC_CARD_PLAN_CHECKPOINT_KIND) {
    throw new WorkflowFail('precondition:missing-topic', `checkpoint artifact kind must be ${TOPIC_CARD_PLAN_CHECKPOINT_KIND}`);
  }
  if (record.checkpoint_version !== TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION) {
    throw new WorkflowFail('precondition:missing-topic', `checkpoint artifact version must be ${TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION}`);
  }
  return {
    checkpoint_kind: TOPIC_CARD_PLAN_CHECKPOINT_KIND,
    checkpoint_version: TOPIC_PLAN_CHECKPOINT_SCHEMA_VERSION,
    subject_id: requireNonEmptyString(record.subject_id, 'checkpoint.subject_id'),
    topic_id: requireNonEmptyString(record.topic_id, 'checkpoint.topic_id'),
    compiled_concept_refs: requireArray(record.compiled_concept_refs, 'checkpoint.compiled_concept_refs').map((entry, index) => {
      const concept = requireRecord(entry, `checkpoint.compiled_concept_refs[${index}]`);
      return {
        concept_id: requireNonEmptyString(concept.concept_id, `checkpoint.compiled_concept_refs[${index}].concept_id`),
        concept_key: requireNonEmptyString(concept.concept_key, `checkpoint.compiled_concept_refs[${index}].concept_key`),
        source_span_ids: requireStringArray(concept.source_span_ids, `checkpoint.compiled_concept_refs[${index}].source_span_ids`),
      };
    }),
    plan_payload: requireRecord(record.plan_payload, 'checkpoint.plan_payload') as TopicCardPlanArtifactPayload,
    compiled_card_specs: requireArray(record.compiled_card_specs, 'checkpoint.compiled_card_specs').map((entry, index) => validateCompiledCardSpec(entry, `checkpoint.compiled_card_specs[${index}]`)),
    compiled_mini_game_specs: requireArray(record.compiled_mini_game_specs, 'checkpoint.compiled_mini_game_specs').map((entry, index) => validateCompiledMiniGameSpec(entry, `checkpoint.compiled_mini_game_specs[${index}]`)),
  };
}

async function loadCheckpointPayload(input: {
  repos: TopicPlanCheckpointRepos;
  runId: string;
  stage: typeof TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE | typeof TOPIC_CARD_PLAN_CHECKPOINT_STAGE;
  expectedInputHash?: string;
}): Promise<{ checkpoint: StageCheckpointRow; payload: unknown } | null> {
  const checkpoint = findReadyCheckpoint(
    await input.repos.stageCheckpoints.byRun(input.runId),
    input.stage,
    input.expectedInputHash,
  );
  if (!checkpoint?.artifact_id) return null;

  const artifact = await input.repos.artifacts.get(checkpoint.artifact_id);
  if (!artifact) {
    throw new WorkflowFail('precondition:missing-topic', `${input.stage} checkpoint artifact row not found: ${checkpoint.artifact_id}`);
  }
  return { checkpoint, payload: await input.repos.artifacts.getStorage(artifact.storage_key) };
}

export async function loadCompiledTopicConceptPlanCheckpoint(
  input: LoadTopicPlanCheckpointInput,
): Promise<PersistedTopicPlanCheckpoint<TopicConceptPlanCheckpointPayload> | null> {
  const loaded = await loadCheckpointPayload({
    repos: input.repos,
    runId: input.runId,
    stage: TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE,
    expectedInputHash: input.expectedInputHash,
  });
  if (!loaded?.checkpoint.artifact_id) return null;
  const payload = validateConceptCheckpointPayload(loaded.payload);
  return {
    stage: TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE,
    kind: TOPIC_CONCEPT_PLAN_CHECKPOINT_KIND,
    artifactId: loaded.checkpoint.artifact_id,
    inputHash: loaded.checkpoint.input_hash,
    contentHash: await contentHash(payload),
    payload,
  };
}

export async function loadCompiledTopicCardPlanCheckpoint(
  input: LoadTopicPlanCheckpointInput,
): Promise<PersistedTopicPlanCheckpoint<TopicCardPlanCheckpointPayload> | null> {
  const loaded = await loadCheckpointPayload({
    repos: input.repos,
    runId: input.runId,
    stage: TOPIC_CARD_PLAN_CHECKPOINT_STAGE,
    expectedInputHash: input.expectedInputHash,
  });
  if (!loaded?.checkpoint.artifact_id) return null;
  const payload = validateCardCheckpointPayload(loaded.payload);
  return {
    stage: TOPIC_CARD_PLAN_CHECKPOINT_STAGE,
    kind: TOPIC_CARD_PLAN_CHECKPOINT_KIND,
    artifactId: loaded.checkpoint.artifact_id,
    inputHash: loaded.checkpoint.input_hash,
    contentHash: await contentHash(payload),
    payload,
  };
}
