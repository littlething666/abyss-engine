import { z } from 'zod';
import { WorkflowFail } from '../lib/workflowErrors';
import { stableLearningContentId } from './deterministicIds';
import type { TopicTheorySourceSpan } from './theorySourceSpans';

export const TOPIC_CONCEPT_PLAN_ARTIFACT_KIND = 'topic-concept-plan' as const;
export const TOPIC_CARD_PLAN_ARTIFACT_KIND = 'topic-card-plan' as const;

export type TopicPlanArtifactKind = typeof TOPIC_CONCEPT_PLAN_ARTIFACT_KIND | typeof TOPIC_CARD_PLAN_ARTIFACT_KIND;
export type TopicPlannedCardType = 'FLASHCARD' | 'MULTIPLE_CHOICE';
export type TopicPlannedMiniGameType = 'CATEGORY_SORT' | 'SEQUENCE_BUILD' | 'MATCH_PAIRS';

const localKeySchema = z.string().trim().min(1).max(96).regex(/^[a-z0-9][a-z0-9._:-]*$/i, {
  message: 'must be a stable local key containing letters, numbers, dot, underscore, colon, or hyphen',
});

const sourceSpanIdsSchema = z.array(z.string().trim().min(1)).min(1);
const difficultySchema = z.number().int().min(1).max(5);

export const topicConceptPlanArtifactPayloadSchema = z.object({
  concepts: z.array(z.object({
    conceptKey: localKeySchema,
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    sourceSpanIds: sourceSpanIdsSchema,
    targetDifficulties: z.array(difficultySchema).min(1).optional(),
    priority: z.number().int().min(1).optional(),
  }).passthrough()).min(1),
}).passthrough();

export const topicCardPlanArtifactPayloadSchema = z.object({
  cardSpecs: z.array(z.object({
    cardKey: localKeySchema,
    conceptKey: localKeySchema,
    cardType: z.enum(['FLASHCARD', 'MULTIPLE_CHOICE']),
    difficulty: difficultySchema,
    prompt: z.string().trim().min(1),
    sourceSpanIds: sourceSpanIdsSchema,
    learningObjective: z.string().trim().min(1).optional(),
  }).passthrough()).min(1),
  miniGameSpecs: z.array(z.object({
    miniGameKey: localKeySchema,
    conceptKey: localKeySchema,
    gameType: z.enum(['CATEGORY_SORT', 'SEQUENCE_BUILD', 'MATCH_PAIRS']),
    difficulty: difficultySchema,
    prompt: z.string().trim().min(1),
    sourceSpanIds: sourceSpanIdsSchema,
    learningObjective: z.string().trim().min(1).optional(),
  }).passthrough()).optional().default([]),
}).passthrough();

export type TopicConceptPlanArtifactPayload = z.infer<typeof topicConceptPlanArtifactPayloadSchema>;
export type TopicCardPlanArtifactPayload = z.infer<typeof topicCardPlanArtifactPayloadSchema>;

export interface CompiledTopicConceptSpec {
  subjectId: string;
  topicId: string;
  conceptId: string;
  conceptKey: string;
  title: string;
  summary: string;
  sourceSpanIds: string[];
  targetDifficulties: number[];
  priority: number;
}

export interface CompiledTopicCardSpec {
  subjectId: string;
  topicId: string;
  cardSpecId: string;
  conceptId: string;
  conceptKey: string;
  cardKey: string;
  cardType: TopicPlannedCardType;
  difficulty: number;
  prompt: string;
  sourceSpanIds: string[];
  learningObjective?: string;
}

export interface CompiledTopicMiniGameSpec {
  subjectId: string;
  topicId: string;
  miniGameSpecId: string;
  conceptId: string;
  conceptKey: string;
  miniGameKey: string;
  gameType: TopicPlannedMiniGameType;
  difficulty: number;
  prompt: string;
  sourceSpanIds: string[];
  learningObjective?: string;
}

export interface CompileTopicConceptPlanInput {
  subjectId: string;
  topicId: string;
  sourceSpans: readonly TopicTheorySourceSpan[];
  payload: unknown;
}

export interface CompileTopicCardPlanInput {
  subjectId: string;
  topicId: string;
  concepts: readonly CompiledTopicConceptSpec[];
  payload: unknown;
}

export interface CompiledTopicCardPlan {
  cardSpecs: CompiledTopicCardSpec[];
  miniGameSpecs: CompiledTopicMiniGameSpec[];
}

function summarizeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  }).join('; ');
}

function requireScopeValue(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be a non-empty string`);
  }
  return value;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueSortedStrings(values: readonly string[], label: string): string[] {
  const normalized = values.map((value) => value.trim()).filter((value) => value.length > 0);
  const unique = [...new Set(normalized)].sort();
  if (unique.length === 0) {
    throw new WorkflowFail('validation:semantic-topic-content', `${label} must contain at least one non-empty sourceSpanId`);
  }
  return unique;
}

function requireKnownSourceSpans(
  spanIds: readonly string[],
  knownSpanIds: ReadonlySet<string>,
  label: string,
): string[] {
  const normalized = uniqueSortedStrings(spanIds, label);
  const unknown = normalized.filter((spanId) => !knownSpanIds.has(spanId));
  if (unknown.length > 0) {
    throw new WorkflowFail(
      'validation:semantic-topic-content',
      `${label} references unknown sourceSpanId values: ${unknown.join(', ')}`,
    );
  }
  return normalized;
}

function requireSubsetSourceSpans(
  spanIds: readonly string[],
  concept: CompiledTopicConceptSpec,
  label: string,
): string[] {
  const conceptSpanIds = new Set(concept.sourceSpanIds);
  const normalized = uniqueSortedStrings(spanIds, label);
  const outsideConcept = normalized.filter((spanId) => !conceptSpanIds.has(spanId));
  if (outsideConcept.length > 0) {
    throw new WorkflowFail(
      'validation:semantic-topic-content',
      `${label} references sourceSpanId values outside concept ${concept.conceptKey}: ${outsideConcept.join(', ')}`,
    );
  }
  return normalized;
}

function buildConceptLookup(concepts: readonly CompiledTopicConceptSpec[]): Map<string, CompiledTopicConceptSpec> {
  const lookup = new Map<string, CompiledTopicConceptSpec>();
  for (const [index, concept] of concepts.entries()) {
    const key = normalizeKey(concept.conceptKey);
    if (lookup.has(key)) {
      throw new WorkflowFail('validation:semantic-topic-content', `compiled concepts[${index}].conceptKey duplicates ${concept.conceptKey}`);
    }
    lookup.set(key, concept);
  }
  if (lookup.size === 0) {
    throw new WorkflowFail('validation:semantic-topic-content', 'topic-card-plan requires at least one compiled concept');
  }
  return lookup;
}

function optionalText(value: string | undefined): { learningObjective?: string } {
  return value === undefined ? {} : { learningObjective: value };
}

export async function compileTopicConceptPlan(input: CompileTopicConceptPlanInput): Promise<CompiledTopicConceptSpec[]> {
  const subjectId = requireScopeValue(input.subjectId, 'subjectId');
  const topicId = requireScopeValue(input.topicId, 'topicId');
  const parsed = topicConceptPlanArtifactPayloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new WorkflowFail(
      'validation:semantic-topic-content',
      `${TOPIC_CONCEPT_PLAN_ARTIFACT_KIND} payload is invalid: ${summarizeIssues(parsed.error)}`,
    );
  }

  const knownSpanIds = new Set(input.sourceSpans.map((span) => span.spanId));
  if (knownSpanIds.size === 0) {
    throw new WorkflowFail('precondition:missing-topic', `${TOPIC_CONCEPT_PLAN_ARTIFACT_KIND} compile requires topic theory source spans`);
  }

  const seenKeys = new Set<string>();
  const concepts: CompiledTopicConceptSpec[] = [];

  for (const [index, concept] of parsed.data.concepts.entries()) {
    const conceptKey = normalizeKey(concept.conceptKey);
    if (seenKeys.has(conceptKey)) {
      throw new WorkflowFail('validation:semantic-topic-content', `${TOPIC_CONCEPT_PLAN_ARTIFACT_KIND}.concepts[${index}].conceptKey duplicates ${concept.conceptKey}`);
    }
    seenKeys.add(conceptKey);

    const sourceSpanIds = requireKnownSourceSpans(
      concept.sourceSpanIds,
      knownSpanIds,
      `${TOPIC_CONCEPT_PLAN_ARTIFACT_KIND}.concepts[${index}].sourceSpanIds`,
    );
    const targetDifficulties = concept.targetDifficulties === undefined
      ? [1, 2, 3, 4]
      : [...new Set(concept.targetDifficulties)].sort((a, b) => a - b);
    const priority = concept.priority ?? index + 1;

    concepts.push({
      subjectId,
      topicId,
      conceptId: await stableLearningContentId(
        'concept',
        'topic-concept-plan:v1',
        subjectId,
        topicId,
        conceptKey,
        sourceSpanIds,
      ),
      conceptKey,
      title: concept.title,
      summary: concept.summary,
      sourceSpanIds,
      targetDifficulties,
      priority,
    });
  }

  return concepts;
}

export async function compileTopicCardPlan(input: CompileTopicCardPlanInput): Promise<CompiledTopicCardPlan> {
  const subjectId = requireScopeValue(input.subjectId, 'subjectId');
  const topicId = requireScopeValue(input.topicId, 'topicId');
  const parsed = topicCardPlanArtifactPayloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new WorkflowFail(
      'validation:semantic-topic-content',
      `${TOPIC_CARD_PLAN_ARTIFACT_KIND} payload is invalid: ${summarizeIssues(parsed.error)}`,
    );
  }

  const conceptsByKey = buildConceptLookup(input.concepts);
  const seenCardKeys = new Set<string>();
  const seenMiniGameKeys = new Set<string>();
  const cardSpecs: CompiledTopicCardSpec[] = [];
  const miniGameSpecs: CompiledTopicMiniGameSpec[] = [];

  for (const [index, spec] of parsed.data.cardSpecs.entries()) {
    const conceptKey = normalizeKey(spec.conceptKey);
    const cardKey = normalizeKey(spec.cardKey);
    if (seenCardKeys.has(cardKey)) {
      throw new WorkflowFail('validation:semantic-topic-content', `${TOPIC_CARD_PLAN_ARTIFACT_KIND}.cardSpecs[${index}].cardKey duplicates ${spec.cardKey}`);
    }
    seenCardKeys.add(cardKey);

    const concept = conceptsByKey.get(conceptKey);
    if (!concept) {
      throw new WorkflowFail('validation:semantic-topic-content', `${TOPIC_CARD_PLAN_ARTIFACT_KIND}.cardSpecs[${index}].conceptKey references unknown concept ${spec.conceptKey}`);
    }
    const sourceSpanIds = requireSubsetSourceSpans(
      spec.sourceSpanIds,
      concept,
      `${TOPIC_CARD_PLAN_ARTIFACT_KIND}.cardSpecs[${index}].sourceSpanIds`,
    );

    cardSpecs.push({
      subjectId,
      topicId,
      cardSpecId: await stableLearningContentId(
        'card_spec',
        'topic-card-plan:v1',
        subjectId,
        topicId,
        concept.conceptId,
        cardKey,
        spec.cardType,
        spec.difficulty,
        sourceSpanIds,
      ),
      conceptId: concept.conceptId,
      conceptKey,
      cardKey,
      cardType: spec.cardType,
      difficulty: spec.difficulty,
      prompt: spec.prompt,
      sourceSpanIds,
      ...optionalText(spec.learningObjective),
    });
  }

  for (const [index, spec] of parsed.data.miniGameSpecs.entries()) {
    const conceptKey = normalizeKey(spec.conceptKey);
    const miniGameKey = normalizeKey(spec.miniGameKey);
    if (seenMiniGameKeys.has(miniGameKey)) {
      throw new WorkflowFail('validation:semantic-topic-content', `${TOPIC_CARD_PLAN_ARTIFACT_KIND}.miniGameSpecs[${index}].miniGameKey duplicates ${spec.miniGameKey}`);
    }
    seenMiniGameKeys.add(miniGameKey);

    const concept = conceptsByKey.get(conceptKey);
    if (!concept) {
      throw new WorkflowFail('validation:semantic-topic-content', `${TOPIC_CARD_PLAN_ARTIFACT_KIND}.miniGameSpecs[${index}].conceptKey references unknown concept ${spec.conceptKey}`);
    }
    const sourceSpanIds = requireSubsetSourceSpans(
      spec.sourceSpanIds,
      concept,
      `${TOPIC_CARD_PLAN_ARTIFACT_KIND}.miniGameSpecs[${index}].sourceSpanIds`,
    );

    miniGameSpecs.push({
      subjectId,
      topicId,
      miniGameSpecId: await stableLearningContentId(
        'mini_game_spec',
        'topic-card-plan-mini-game:v1',
        subjectId,
        topicId,
        concept.conceptId,
        miniGameKey,
        spec.gameType,
        spec.difficulty,
        sourceSpanIds,
      ),
      conceptId: concept.conceptId,
      conceptKey,
      miniGameKey,
      gameType: spec.gameType,
      difficulty: spec.difficulty,
      prompt: spec.prompt,
      sourceSpanIds,
      ...optionalText(spec.learningObjective),
    });
  }

  return { cardSpecs, miniGameSpecs };
}
