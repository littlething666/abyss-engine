import {
  buildCrystalTrialSnapshot,
  buildSubjectGraphEdgesSnapshot,
  buildSubjectGraphTopicsSnapshot,
  buildTopicExpansionSnapshot,
  buildTopicMiniGameCardsSnapshot,
  buildTopicStudyCardsSnapshot,
  buildTopicTheorySnapshot,
  contentHash,
  crystalTrialSchemaVersion,
  subjectGraphEdgesSchemaVersion,
  subjectGraphTopicsSchemaVersion,
  topicExpansionCardsSchemaVersion,
  topicMiniGameCategorySortSchemaVersion,
  topicMiniGameMatchPairsSchemaVersion,
  topicMiniGameSequenceBuildSchemaVersion,
  topicStudyCardsSchemaVersion,
  topicTheorySchemaVersion,
  type MiniGamePipelineKind,
  type RunInputSnapshot,
} from '../contracts/generationContracts';
import { resolveGenerationJobPolicy, type BackendGenerationJobKind } from '../generationPolicy';
import type { ILearningContentRepo } from '../learningContent/learningContentRepo';
import type { JsonObject, LearningContentSubject, TopicCardContent, TopicDetailsContent } from '../learningContent/types';
import type { PipelineKind } from '../repositories/types';

const PROMPT_TEMPLATE_VERSION = 'v1';
const MAX_CARD_DIFFICULTY = 4;
const TRIAL_QUESTION_COUNT = 5;

const FORBIDDEN_POLICY_FIELDS = new Set([
  'model',
  'modelId',
  'model_id',
  'provider',
  'providerHealingRequested',
  'responseHealing',
  'openRouterResponseHealing',
  'plugins',
  'response_format',
]);

const MINI_GAME_PIPELINE_BY_TYPE = {
  CATEGORY_SORT: 'topic-mini-game-category-sort',
  SEQUENCE_BUILD: 'topic-mini-game-sequence-build',
  MATCH_PAIRS: 'topic-mini-game-match-pairs',
} as const satisfies Record<string, MiniGamePipelineKind>;

const MINI_GAME_SCHEMA_VERSION_BY_TYPE = {
  CATEGORY_SORT: topicMiniGameCategorySortSchemaVersion,
  SEQUENCE_BUILD: topicMiniGameSequenceBuildSchemaVersion,
  MATCH_PAIRS: topicMiniGameMatchPairsSchemaVersion,
} as const;

type TopicContentStage = 'theory' | 'study-cards' | 'mini-games' | 'full';
type SubjectGraphStage = 'topics' | 'edges';
type MiniGameType = keyof typeof MINI_GAME_PIPELINE_BY_TYPE;

export interface IntentExpandedRun {
  kind: PipelineKind;
  snapshot: RunInputSnapshot & Record<string, unknown>;
  subjectId: string;
  topicId: string | null;
}

export interface ExpandRunIntentDeps {
  deviceId: string;
  kind: PipelineKind;
  intent: Record<string, unknown>;
  learningContent: ILearningContentRepo;
  now: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pathJoin(path: string, segment: string | number): string {
  return `${path}.${String(segment)}`;
}

export function assertNoForbiddenPolicyFields(value: unknown, path = 'body'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenPolicyFields(item, `${path}[${index}]`));
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = pathJoin(path, key);
    if (FORBIDDEN_POLICY_FIELDS.has(key)) {
      throw new Error(`POST /v1/runs intent must not contain backend generation policy field: ${childPath}`);
    }
    assertNoForbiddenPolicyFields(child, childPath);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value as number;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, label);
}

function requireStage(value: unknown, label: string): TopicContentStage {
  if (value === undefined) return 'full';
  if (value === 'theory' || value === 'study-cards' || value === 'mini-games' || value === 'full') {
    return value;
  }
  throw new Error(`${label} must be one of theory, study-cards, mini-games, full`);
}

function requireSubjectGraphStage(value: unknown, label: string): SubjectGraphStage {
  if (value === 'topics' || value === 'edges') return value;
  throw new Error(`${label} must be one of topics, edges`);
}

function requireMiniGameType(value: unknown, label: string): MiniGameType {
  if (value === undefined) return 'CATEGORY_SORT';
  if (value === 'CATEGORY_SORT' || value === 'SEQUENCE_BUILD' || value === 'MATCH_PAIRS') return value;
  throw new Error(`${label} must be one of CATEGORY_SORT, SEQUENCE_BUILD, MATCH_PAIRS`);
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings when present`);
  }
  return [...value] as string[];
}

function requireStringArray(value: unknown, label: string): string[] {
  const array = optionalStringArray(value, label);
  if (!array) throw new Error(`${label} must be an array of strings`);
  return array;
}

function requireJsonObject(value: unknown, label: string): JsonObject {
  return requireRecord(value, label) as JsonObject;
}

function requireSubjectMetadataEnvelope(subject: LearningContentSubject): Record<string, unknown> {
  const metadata = requireRecord(subject.metadata, `subject ${subject.subjectId}.metadata`);
  return requireRecord(metadata.subject, `subject ${subject.subjectId}.metadata.subject`);
}

function contentBriefFromSubject(subject: LearningContentSubject): string | undefined {
  const envelope = requireSubjectMetadataEnvelope(subject);
  if (envelope.metadata === undefined) return undefined;
  const domainMetadata = requireRecord(envelope.metadata, `subject ${subject.subjectId}.metadata.subject.metadata`);
  const strategy = domainMetadata.strategy === undefined
    ? undefined
    : requireRecord(domainMetadata.strategy, `subject ${subject.subjectId}.metadata.subject.metadata.strategy`);
  const content = strategy?.content === undefined
    ? undefined
    : requireRecord(strategy.content, `subject ${subject.subjectId}.metadata.subject.metadata.strategy.content`);
  const brief = content?.contentBrief;
  return typeof brief === 'string' && brief.trim().length > 0 ? brief.trim() : undefined;
}

async function requireSubject(repo: ILearningContentRepo, deviceId: string, subjectId: string): Promise<LearningContentSubject> {
  const manifest = await repo.getManifest(deviceId);
  const subject = manifest.subjects.find((row) => row.subjectId === subjectId);
  if (!subject) throw new Error(`Learning Content subject not found: ${subjectId}`);
  return subject;
}

async function requireTopicNode(repo: ILearningContentRepo, deviceId: string, subjectId: string, topicId: string): Promise<Record<string, unknown>> {
  const graph = await repo.getSubjectGraph(deviceId, subjectId);
  if (!graph) throw new Error(`Learning Content subject graph not found: ${subjectId}`);
  const graphJson = requireRecord(graph.graph, `subject graph ${subjectId}`);
  const nodes = graphJson.nodes;
  if (!Array.isArray(nodes)) throw new Error(`subject graph ${subjectId}.nodes must be an array`);
  const node = nodes.find((candidate) => isRecord(candidate) && candidate.topicId === topicId);
  if (!node || !isRecord(node)) throw new Error(`Topic "${topicId}" not found in subject graph ${subjectId}`);
  return node;
}

async function requireTopicDetails(repo: ILearningContentRepo, deviceId: string, subjectId: string, topicId: string): Promise<TopicDetailsContent> {
  const details = await repo.getTopicDetails(deviceId, subjectId, topicId);
  if (!details) throw new Error(`Learning Content topic details not found: ${subjectId}/${topicId}`);
  if (details.status !== 'ready') {
    throw new Error(`Learning Content topic details must be ready for generation intent: ${subjectId}/${topicId}`);
  }
  return details;
}

function groundingSources(details: JsonObject, label: string): Record<string, unknown>[] {
  const value = details.groundingSources;
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error(`${label}.groundingSources must be an array of objects when present`);
  }
  return value as Record<string, unknown>[];
}

function hasAuthoritativePrimarySource(details: JsonObject, label: string): boolean {
  return groundingSources(details, label).some((source) => source.trustLevel === 'high');
}

function questionsForDifficulty(details: JsonObject, difficulty: number, label: string): string[] {
  const buckets = requireRecord(details.coreQuestionsByDifficulty, `${label}.coreQuestionsByDifficulty`);
  const bucket = buckets[String(difficulty)] ?? buckets[difficulty];
  const questions = requireStringArray(bucket, `${label}.coreQuestionsByDifficulty.${difficulty}`);
  if (questions.length === 0) throw new Error(`${label}.coreQuestionsByDifficulty.${difficulty} must not be empty`);
  return questions;
}

function theoryExcerpt(details: JsonObject, label: string): string {
  const theory = requireString(details.theory, `${label}.theory`).trim();
  return theory.length > 12000 ? `${theory.slice(0, 12000)}\n\n…` : theory;
}

function normalizeConceptText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[$`*_~()[\]{}.,!?;:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function conceptTarget(card: Record<string, unknown>, label: string): string {
  if (typeof card.conceptTarget === 'string' && card.conceptTarget.trim().length > 0) {
    return normalizeConceptText(card.conceptTarget);
  }
  const content = requireRecord(card.content, `${label}.content`);
  switch (card.type) {
    case 'FLASHCARD':
      return normalizeConceptText(`${requireString(content.front, `${label}.content.front`)} ${requireString(content.back, `${label}.content.back`)}`);
    case 'SINGLE_CHOICE':
      return normalizeConceptText(`${requireString(content.question, `${label}.content.question`)} ${requireString(content.correctAnswer, `${label}.content.correctAnswer`)}`);
    case 'MULTI_CHOICE':
      return normalizeConceptText(`${requireString(content.question, `${label}.content.question`)} ${requireStringArray(content.correctAnswers, `${label}.content.correctAnswers`).join(' ')}`);
    case 'MINI_GAME': {
      const gameType = requireString(content.gameType, `${label}.content.gameType`);
      if (gameType === 'CATEGORY_SORT') {
        const categories = Array.isArray(content.categories) ? content.categories : [];
        return normalizeConceptText(`${requireString(content.prompt, `${label}.content.prompt`)} ${categories.map((category, index) => requireString(requireRecord(category, `${label}.content.categories[${index}]`).label, `${label}.content.categories[${index}].label`)).join(' ')}`);
      }
      if (gameType === 'SEQUENCE_BUILD') {
        const items = Array.isArray(content.items) ? content.items : [];
        return normalizeConceptText(`${requireString(content.prompt, `${label}.content.prompt`)} ${items.map((item, index) => requireString(requireRecord(item, `${label}.content.items[${index}]`).label, `${label}.content.items[${index}].label`)).join(' ')}`);
      }
      if (gameType === 'MATCH_PAIRS') {
        const pairs = Array.isArray(content.pairs) ? content.pairs : [];
        return normalizeConceptText(`${requireString(content.prompt, `${label}.content.prompt`)} ${pairs.map((pair, index) => {
          const row = requireRecord(pair, `${label}.content.pairs[${index}]`);
          return `${requireString(row.left, `${label}.content.pairs[${index}].left`)} ${requireString(row.right, `${label}.content.pairs[${index}].right`)}`;
        }).join(' ')}`);
      }
      throw new Error(`${label}.content.gameType has unsupported mini-game type: ${gameType}`);
    }
    default:
      throw new Error(`${label}.type has unsupported card type: ${String(card.type)}`);
  }
}

function cardRecords(cards: TopicCardContent[]): Record<string, unknown>[] {
  return cards.map((row, index) => {
    const card = requireRecord(row.card, `topicCards[${index}].card`);
    if (card.id !== row.cardId) {
      throw new Error(`topicCards[${index}] card id mismatch: row ${row.cardId} vs card ${String(card.id)}`);
    }
    return card;
  });
}

async function policyFields(deviceId: string, jobKind: BackendGenerationJobKind): Promise<{
  modelId: string;
  generationPolicyHash: string;
  providerHealingRequested: true;
}> {
  const policy = await resolveGenerationJobPolicy(deviceId, jobKind);
  return {
    modelId: policy.modelId,
    generationPolicyHash: policy.generationPolicyHash,
    providerHealingRequested: policy.providerHealingRequested,
  };
}

async function withBackendPolicy(
  deviceId: string,
  jobKind: BackendGenerationJobKind,
  build: (modelId: string) => RunInputSnapshot & Record<string, unknown>,
): Promise<RunInputSnapshot & Record<string, unknown>> {
  const policy = await policyFields(deviceId, jobKind);
  return {
    ...build(policy.modelId),
    generation_policy_hash: policy.generationPolicyHash,
    provider_healing_requested: policy.providerHealingRequested,
  };
}

async function expandTopicContentIntent(deps: ExpandRunIntentDeps): Promise<IntentExpandedRun> {
  const { deviceId, intent, learningContent, now } = deps;
  const subjectId = requireString(intent.subjectId, 'intent.subjectId');
  const topicId = requireString(intent.topicId, 'intent.topicId');
  const stage = requireStage(intent.stage, 'intent.stage');
  const capturedAt = now().toISOString();

  if (stage === 'theory' || stage === 'full') {
    const [subject, node] = await Promise.all([
      requireSubject(learningContent, deviceId, subjectId),
      requireTopicNode(learningContent, deviceId, subjectId, topicId),
    ]);
    const snapshot = await withBackendPolicy(deviceId, 'topic-theory', (modelId) => ({
      ...buildTopicTheorySnapshot({
        subjectId,
        topicId,
        schemaVersion: topicTheorySchemaVersion,
        promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
        modelId,
        capturedAt,
        topicTitle: requireString(node.title, `subject graph ${subjectId}/${topicId}.title`),
        learningObjective: requireString(node.learningObjective, `subject graph ${subjectId}/${topicId}.learningObjective`),
        contentBrief: contentBriefFromSubject(subject),
      }),
      stage,
    }));
    return { kind: deps.kind, snapshot, subjectId, topicId };
  }

  const detailsRow = await requireTopicDetails(learningContent, deviceId, subjectId, topicId);
  const details = requireJsonObject(detailsRow.details, `topic details ${subjectId}/${topicId}`);
  const targetDifficulty = 1;
  const sources = groundingSources(details, `topic details ${subjectId}/${topicId}`);

  if (stage === 'study-cards') {
    const snapshot = await withBackendPolicy(deviceId, 'topic-study-cards', (modelId) => ({
      ...buildTopicStudyCardsSnapshot({
        subjectId,
        topicId,
        schemaVersion: topicStudyCardsSchemaVersion,
        promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
        modelId,
        capturedAt,
        theoryExcerpt: theoryExcerpt(details, `topic details ${subjectId}/${topicId}`),
        syllabusQuestions: questionsForDifficulty(details, targetDifficulty, `topic details ${subjectId}/${topicId}`),
        targetDifficulty,
        groundingSourceCount: sources.length,
        hasAuthoritativePrimarySource: hasAuthoritativePrimarySource(details, `topic details ${subjectId}/${topicId}`),
      }),
      stage,
    }));
    return { kind: deps.kind, snapshot, subjectId, topicId };
  }

  const miniGameType = requireMiniGameType(intent.miniGameType, 'intent.miniGameType');
  const jobKind = MINI_GAME_PIPELINE_BY_TYPE[miniGameType];
  const snapshot = await withBackendPolicy(deviceId, jobKind, (modelId) => ({
    ...buildTopicMiniGameCardsSnapshot({
      pipelineKind: jobKind,
      subjectId,
      topicId,
      schemaVersion: MINI_GAME_SCHEMA_VERSION_BY_TYPE[miniGameType],
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
      modelId,
      capturedAt,
      theoryExcerpt: theoryExcerpt(details, `topic details ${subjectId}/${topicId}`),
      syllabusQuestions: questionsForDifficulty(details, targetDifficulty, `topic details ${subjectId}/${topicId}`),
      targetDifficulty,
      groundingSourceCount: sources.length,
      hasAuthoritativePrimarySource: hasAuthoritativePrimarySource(details, `topic details ${subjectId}/${topicId}`),
    }),
    stage,
  }));
  return { kind: deps.kind, snapshot, subjectId, topicId };
}

async function expandTopicExpansionIntent(deps: ExpandRunIntentDeps): Promise<IntentExpandedRun> {
  const { deviceId, intent, learningContent, now } = deps;
  const subjectId = requireString(intent.subjectId, 'intent.subjectId');
  const topicId = requireString(intent.topicId, 'intent.topicId');
  const nextLevel = requirePositiveInteger(intent.nextLevel, 'intent.nextLevel');
  if (nextLevel !== 1 && nextLevel !== 2 && nextLevel !== 3) {
    throw new Error('intent.nextLevel must be one of 1, 2, 3');
  }
  const difficulty = nextLevel + 1;
  const [detailsRow, cardRows] = await Promise.all([
    requireTopicDetails(learningContent, deviceId, subjectId, topicId),
    learningContent.getTopicCards(deviceId, subjectId, topicId),
  ]);
  const details = requireJsonObject(detailsRow.details, `topic details ${subjectId}/${topicId}`);
  const cards = cardRecords(cardRows);
  const snapshot = await withBackendPolicy(deviceId, 'topic-expansion-cards', (modelId) => buildTopicExpansionSnapshot({
    subjectId,
    topicId,
    schemaVersion: topicExpansionCardsSchemaVersion,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    modelId,
    capturedAt: now().toISOString(),
    nextLevel,
    difficulty,
    theoryExcerpt: theoryExcerpt(details, `topic details ${subjectId}/${topicId}`),
    syllabusQuestions: questionsForDifficulty(details, difficulty, `topic details ${subjectId}/${topicId}`),
    existingCardIds: cards.map((card) => requireString(card.id, 'topic card.id')),
    existingConceptStems: cards.map((card, index) => conceptTarget(card, `topicCards[${index}].card`)).filter((target) => target.length > 0),
    groundingSourceCount: groundingSources(details, `topic details ${subjectId}/${topicId}`).length,
  }));
  return { kind: deps.kind, snapshot, subjectId, topicId };
}

async function expandSubjectGraphIntent(deps: ExpandRunIntentDeps): Promise<IntentExpandedRun> {
  const { deviceId, intent, now } = deps;
  const subjectId = requireString(intent.subjectId, 'intent.subjectId');
  const stage = requireSubjectGraphStage(intent.stage, 'intent.stage');
  const capturedAt = now().toISOString();

  if (stage === 'edges') {
    const snapshot = await withBackendPolicy(deviceId, 'subject-graph-edges', (modelId) => buildSubjectGraphEdgesSnapshot({
      subjectId,
      schemaVersion: subjectGraphEdgesSchemaVersion,
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
      modelId,
      capturedAt,
      latticeArtifactContentHash: requireString(intent.latticeArtifactContentHash, 'intent.latticeArtifactContentHash'),
    }));
    return { kind: deps.kind, snapshot, subjectId, topicId: null };
  }

  const checklist = requireRecord(intent.checklist, 'intent.checklist');
  const strategyBrief = requireRecord(intent.strategyBrief, 'intent.strategyBrief');
  const snapshot = await withBackendPolicy(deviceId, 'subject-graph-topics', (modelId) => buildSubjectGraphTopicsSnapshot({
    subjectId,
    schemaVersion: subjectGraphTopicsSchemaVersion,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    modelId,
    capturedAt,
    checklist: {
      topic_name: requireString(checklist.topic_name, 'intent.checklist.topic_name'),
      study_goal: optionalString(checklist.study_goal, 'intent.checklist.study_goal'),
      prior_knowledge: optionalString(checklist.prior_knowledge, 'intent.checklist.prior_knowledge'),
      learning_style: optionalString(checklist.learning_style, 'intent.checklist.learning_style'),
      focus_areas: optionalString(checklist.focus_areas, 'intent.checklist.focus_areas'),
    },
    strategyBrief: {
      total_tiers: requirePositiveInteger(strategyBrief.total_tiers, 'intent.strategyBrief.total_tiers'),
      topics_per_tier: requirePositiveInteger(strategyBrief.topics_per_tier, 'intent.strategyBrief.topics_per_tier'),
      audience_brief: requireString(strategyBrief.audience_brief, 'intent.strategyBrief.audience_brief'),
      domain_brief: requireString(strategyBrief.domain_brief, 'intent.strategyBrief.domain_brief'),
      focus_constraints: typeof strategyBrief.focus_constraints === 'string' ? strategyBrief.focus_constraints : '',
    },
  }));
  return { kind: deps.kind, snapshot, subjectId, topicId: null };
}

async function expandCrystalTrialIntent(deps: ExpandRunIntentDeps): Promise<IntentExpandedRun> {
  const { deviceId, intent, learningContent, now } = deps;
  const subjectId = requireString(intent.subjectId, 'intent.subjectId');
  const topicId = requireString(intent.topicId, 'intent.topicId');
  const currentLevel = requireNonNegativeInteger(intent.currentLevel, 'intent.currentLevel');
  const targetLevel = intent.targetLevel === undefined
    ? currentLevel + 1
    : requirePositiveInteger(intent.targetLevel, 'intent.targetLevel');

  await requireTopicNode(learningContent, deviceId, subjectId, topicId);
  const [subject, cardRows] = await Promise.all([
    requireSubject(learningContent, deviceId, subjectId),
    learningContent.getTopicCards(deviceId, subjectId, topicId),
  ]);
  const cards = cardRecords(cardRows);
  const targetDifficulty = Math.min(currentLevel + 1, MAX_CARD_DIFFICULTY);
  let levelCards = cards.filter((card) => card.difficulty === targetDifficulty);
  if (levelCards.length === 0) {
    levelCards = cards.filter((card) => card.difficulty === MAX_CARD_DIFFICULTY);
  }
  if (levelCards.length === 0) throw new Error(`No Learning Content cards available for crystal trial difficulty ${targetDifficulty}`);

  const cardPoolHash = await contentHash({
    cardIds: levelCards.map((card) => requireString(card.id, 'topic card.id')).sort(),
  });
  const snapshot = await withBackendPolicy(deviceId, 'crystal-trial', (modelId) => buildCrystalTrialSnapshot({
    subjectId,
    topicId,
    schemaVersion: crystalTrialSchemaVersion,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    modelId,
    capturedAt: now().toISOString(),
    currentLevel,
    targetLevel,
    cardPoolHash,
    questionCount: TRIAL_QUESTION_COUNT,
    contentBrief: contentBriefFromSubject(subject),
  }));
  return { kind: deps.kind, snapshot, subjectId, topicId };
}

export async function expandRunIntent(deps: ExpandRunIntentDeps): Promise<IntentExpandedRun> {
  switch (deps.kind) {
    case 'topic-content':
      return expandTopicContentIntent(deps);
    case 'topic-expansion':
      return expandTopicExpansionIntent(deps);
    case 'subject-graph':
      return expandSubjectGraphIntent(deps);
    case 'crystal-trial':
      return expandCrystalTrialIntent(deps);
    default: {
      const _exhaustive: never = deps.kind;
      return _exhaustive;
    }
  }
}
