import { WorkflowFail } from '../lib/workflowErrors';
import { contentHash as computeContentHash, type ArtifactKind } from '../contracts/generationContracts';
import type { ILearningContentRepo } from './learningContentRepo';
import type { JsonObject, PutTopicCardInput, TopicDetailsContent } from './types';
import { buildPlannedTopicCardMaterializationIds, buildTopicCardMaterializationIds } from './deterministicIds';
import { buildTopicTheorySourceSpans, topicTheorySourceSpansAsJson } from './theorySourceSpans';

const TOPIC_CARD_ARTIFACT_KINDS = new Set<ArtifactKind>([
  'topic-study-cards',
  'topic-card-content',
  'topic-mini-game-content',
  'topic-expansion-cards',
  'topic-mini-game-category-sort',
  'topic-mini-game-sequence-build',
  'topic-mini-game-match-pairs',
]);

export interface ApplyArtifactToLearningContentInput {
  learningContent: ILearningContentRepo;
  deviceId: string;
  runId: string;
  artifactKind: ArtifactKind;
  payload: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  contentHash: string;
}

export interface PublishCompleteSubjectGraphInput {
  learningContent: ILearningContentRepo;
  deviceId: string;
  runId: string;
  snapshot: Record<string, unknown>;
  topicsPayload: Record<string, unknown>;
  edgesPayload: Record<string, unknown>;
  topicsContentHash: string;
  edgesContentHash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new WorkflowFail('precondition:missing-topic', `${label} must be a JSON object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function requireStringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be a string`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be a positive integer`);
  }
  return value as number;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be an array`);
  }
  return value;
}

function snapshotSubjectId(snapshot: Record<string, unknown>): string {
  return requireString(snapshot.subject_id, 'snapshot.subject_id');
}

function snapshotTopicId(snapshot: Record<string, unknown>): string {
  return requireString(snapshot.topic_id, 'snapshot.topic_id');
}

interface PlannedStudyCardBinding {
  conceptId: string;
  cardSpecId: string;
  cardType: string;
  difficulty: number;
}

interface PlannedMiniGameBinding {
  conceptId: string;
  miniGameSpecId: string;
  gameType: string;
  difficulty: number;
}

type PlannedCardBinding = PlannedStudyCardBinding | PlannedMiniGameBinding;

function optionalRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  if (value === undefined) return [];
  const items = requireArray(value, label);
  return items.map((item, index) => requireRecord(item, `${label}[${index}]`));
}

function plannedStudyCardBindingsFromSnapshot(snapshot: Record<string, unknown>): PlannedStudyCardBinding[] {
  return optionalRecordArray(snapshot.compiled_study_card_specs, 'snapshot.compiled_study_card_specs').map((spec, index) => ({
    conceptId: requireString(spec.concept_id, `snapshot.compiled_study_card_specs[${index}].concept_id`),
    cardSpecId: requireString(spec.card_spec_id, `snapshot.compiled_study_card_specs[${index}].card_spec_id`),
    cardType: requireString(spec.card_type, `snapshot.compiled_study_card_specs[${index}].card_type`),
    difficulty: requirePositiveInteger(spec.difficulty, `snapshot.compiled_study_card_specs[${index}].difficulty`),
  }));
}

function plannedMiniGameBindingsFromSnapshot(snapshot: Record<string, unknown>): PlannedMiniGameBinding[] {
  return optionalRecordArray(snapshot.compiled_mini_game_specs, 'snapshot.compiled_mini_game_specs').map((spec, index) => ({
    conceptId: requireString(spec.concept_id, `snapshot.compiled_mini_game_specs[${index}].concept_id`),
    miniGameSpecId: requireString(spec.mini_game_spec_id, `snapshot.compiled_mini_game_specs[${index}].mini_game_spec_id`),
    gameType: requireString(spec.game_type, `snapshot.compiled_mini_game_specs[${index}].game_type`),
    difficulty: requirePositiveInteger(spec.difficulty, `snapshot.compiled_mini_game_specs[${index}].difficulty`),
  }));
}

function plannedBindingsForArtifactKind(
  artifactKind: ArtifactKind,
  snapshot: Record<string, unknown>,
): PlannedCardBinding[] {
  if (artifactKind === 'topic-study-cards' || artifactKind === 'topic-card-content') return plannedStudyCardBindingsFromSnapshot(snapshot);
  if (
    artifactKind === 'topic-mini-game-content'
    || artifactKind === 'topic-mini-game-category-sort'
    || artifactKind === 'topic-mini-game-sequence-build'
    || artifactKind === 'topic-mini-game-match-pairs'
  ) {
    return plannedMiniGameBindingsFromSnapshot(snapshot);
  }
  return [];
}

function expectedMiniGameContentGameType(plannedGameType: string): string {
  if (plannedGameType === 'CATEGORY_SORT' || plannedGameType === 'SEQUENCE_BUILD' || plannedGameType === 'MATCH_PAIRS') return plannedGameType;
  throw new WorkflowFail('validation:semantic-topic-content', `unsupported compiled mini-game spec type ${plannedGameType}`);
}

function checklistFromSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  return requireRecord(snapshot.checklist, 'snapshot.checklist');
}

function strategyBriefFromSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  return requireRecord(snapshot.strategy_brief, 'snapshot.strategy_brief');
}

async function topicDetailsFromTheory(
  snapshot: Record<string, unknown>,
  payload: Record<string, unknown>,
  existing: TopicDetailsContent | null,
): Promise<JsonObject> {
  const subjectId = snapshotSubjectId(snapshot);
  const topicId = snapshotTopicId(snapshot);
  const sourceSpans = await buildTopicTheorySourceSpans({ subjectId, topicId, payload });

  return {
    ...(existing?.details ?? {}),
    topicId,
    subjectId,
    title: optionalString((existing?.details as Record<string, unknown> | undefined)?.title)
      ?? optionalString(snapshot.topic_title)
      ?? snapshotTopicId(snapshot),
    coreConcept: requireString(payload.coreConcept, 'topic-theory.coreConcept'),
    theory: requireString(payload.theory, 'topic-theory.theory'),
    keyTakeaways: payload.keyTakeaways,
    coreQuestionsByDifficulty: payload.coreQuestionsByDifficulty,
    sourceSpans: topicTheorySourceSpansAsJson(sourceSpans),
  } as JsonObject;
}

function deckStudyCardFromCanonical(card: Record<string, unknown>, label: string): JsonObject | null {
  const difficulty = requirePositiveInteger(card.difficulty, `${label}.difficulty`);
  const type = requireString(card.type, `${label}.type`);
  const content = requireRecord(card.content, `${label}.content`);

  if (type === 'FLASHCARD') {
    return {
      type: 'FLASHCARD',
      difficulty,
      content: {
        front: requireString(content.front, `${label}.content.front`),
        back: requireString(content.back, `${label}.content.back`),
      },
    };
  }

  if (type === 'MULTIPLE_CHOICE') {
    if (typeof content.correctAnswer === 'string') {
      return {
        type: 'SINGLE_CHOICE',
        difficulty,
        content: {
          question: String(content.question ?? ''),
          options: Array.isArray(content.options) ? content.options.map(String) : [],
          correctAnswer: content.correctAnswer,
          explanation: String(content.explanation ?? ''),
        },
      };
    }

    if (Array.isArray(content.correctAnswers)) {
      return {
        type: 'MULTI_CHOICE',
        difficulty,
        content: {
          question: String(content.question ?? ''),
          options: Array.isArray(content.options) ? content.options.map(String) : [],
          correctAnswers: content.correctAnswers.map(String),
          explanation: String(content.explanation ?? ''),
        },
      };
    }

    throw new WorkflowFail('validation:semantic-topic-content', `${label}.content must contain correctAnswer or correctAnswers`);
  }

  // The durable schema still admits CLOZE, but the current deck read model has
  // no CLOZE CardType. Mirror the existing frontend applier contract: CLOZE is
  // not materialized into the deck-compatible read model.
  if (type === 'CLOZE') return null;

  throw new WorkflowFail('validation:semantic-topic-content', `${label}.type has unsupported study-card type ${type}`);
}

function deckMiniGameCardFromCanonical(card: Record<string, unknown>, label: string): JsonObject {
  const difficulty = requirePositiveInteger(card.difficulty, `${label}.difficulty`);
  const content = requireRecord(card.content, `${label}.content`);
  requireString(content.gameType, `${label}.content.gameType`);
  return { type: 'MINI_GAME', difficulty, content };
}

async function cardRowsFromPayload(
  artifactKind: ArtifactKind,
  payload: Record<string, unknown>,
  input: { subjectId: string; topicId: string; snapshot: Record<string, unknown> },
): Promise<PutTopicCardInput[]> {
  const cards = artifactKind === 'topic-card-content' || artifactKind === 'topic-mini-game-content' ? [payload.card] : payload.cards;
  if (!Array.isArray(cards)) {
    throw new WorkflowFail('validation:semantic-topic-content', `${artifactKind}.cards must be an array`);
  }

  const plannedBindings = plannedBindingsForArtifactKind(artifactKind, input.snapshot);
  if (plannedBindings.length > 0 && cards.length !== plannedBindings.length) {
    throw new WorkflowFail(
      'validation:semantic-topic-content',
      `${artifactKind}.cards length ${cards.length} must match compiled spec count ${plannedBindings.length}`,
    );
  }

  const rows: PutTopicCardInput[] = [];
  const seenSignatures = new Set<string>();
  for (const [index, value] of cards.entries()) {
    const canonical = requireRecord(value, `${artifactKind}.cards[${index}]`);
    const plannedBinding = plannedBindings[index];
    const deckCard = artifactKind === 'topic-study-cards' || artifactKind === 'topic-card-content' || artifactKind === 'topic-expansion-cards'
      ? deckStudyCardFromCanonical(canonical, `${artifactKind}.cards[${index}]`)
      : deckMiniGameCardFromCanonical(canonical, `${artifactKind}.cards[${index}]`);
    if (!deckCard) {
      if (plannedBinding) {
        throw new WorkflowFail('validation:semantic-topic-content', `${artifactKind}.cards[${index}] is not deck-compatible for compiled spec materialization`);
      }
      continue;
    }

    if (plannedBinding) {
      if ('cardSpecId' in plannedBinding) {
        const generatedType = requireString(canonical.type, `${artifactKind}.cards[${index}].type`);
        if (generatedType !== plannedBinding.cardType) {
          throw new WorkflowFail(
            'validation:semantic-topic-content',
            `${artifactKind}.cards[${index}].type ${generatedType} must match compiled card spec type ${plannedBinding.cardType}`,
          );
        }
      } else {
        const content = requireRecord(canonical.content, `${artifactKind}.cards[${index}].content`);
        const expectedGameType = expectedMiniGameContentGameType(plannedBinding.gameType);
        if (requireString(content.gameType, `${artifactKind}.cards[${index}].content.gameType`) !== expectedGameType) {
          throw new WorkflowFail(
            'validation:semantic-topic-content',
            `${artifactKind}.cards[${index}].content.gameType must match compiled mini-game spec type ${expectedGameType}`,
          );
        }
      }
      if (requirePositiveInteger(deckCard.difficulty, `${artifactKind}.cards[${index}].difficulty`) !== plannedBinding.difficulty) {
        throw new WorkflowFail(
          'validation:semantic-topic-content',
          `${artifactKind}.cards[${index}].difficulty must match compiled spec difficulty ${plannedBinding.difficulty}`,
        );
      }
    }

    const ids = plannedBinding
      ? await buildPlannedTopicCardMaterializationIds({
        subjectId: input.subjectId,
        topicId: input.topicId,
        card: deckCard,
        conceptId: plannedBinding.conceptId,
        ...('cardSpecId' in plannedBinding
          ? { cardSpecId: plannedBinding.cardSpecId }
          : { miniGameSpecId: plannedBinding.miniGameSpecId }),
      })
      : await buildTopicCardMaterializationIds({
        subjectId: input.subjectId,
        topicId: input.topicId,
        artifactKind,
        cardIndex: index,
        card: deckCard,
      });

    if (seenSignatures.has(ids.questionSignature)) {
      throw new WorkflowFail(
        'validation:semantic-topic-content',
        `${artifactKind}.cards[${index}] duplicates question_signature ${ids.questionSignature}`,
      );
    }
    seenSignatures.add(ids.questionSignature);

    const card = {
      ...deckCard,
      id: ids.cardId,
      conceptId: ids.conceptId,
      ...(ids.cardSpecId ? { cardSpecId: ids.cardSpecId } : {}),
      ...(ids.miniGameSpecId ? { miniGameSpecId: ids.miniGameSpecId } : {}),
      questionSignature: ids.questionSignature,
    } as JsonObject;

    rows.push({
      cardId: ids.cardId,
      conceptId: ids.conceptId,
      cardSpecId: ids.cardSpecId,
      miniGameSpecId: ids.miniGameSpecId,
      questionSignature: ids.questionSignature,
      card,
      difficulty: requirePositiveInteger(deckCard.difficulty, `${artifactKind}.cards[${index}].difficulty`),
      sourceArtifactKind: artifactKind,
    });
  }

  if (rows.length === 0) {
    throw new WorkflowFail('validation:semantic-topic-content', `${artifactKind} produced no deck-compatible cards`);
  }
  return rows;
}

async function applyTopicTheory(input: ApplyArtifactToLearningContentInput): Promise<void> {
  const subjectId = snapshotSubjectId(input.snapshot);
  const topicId = snapshotTopicId(input.snapshot);
  const existing = await input.learningContent.getTopicDetails(input.deviceId, subjectId, topicId);
  const details = await topicDetailsFromTheory(input.snapshot, input.payload, existing);
  await input.learningContent.putTopicDetails({
    deviceId: input.deviceId,
    subjectId,
    topicId,
    details,
    contentHash: input.contentHash,
    status: existing?.status === 'generating' ? 'generating' : 'unavailable',
    updatedByRunId: input.runId,
  });
}

async function markTopicReady(input: ApplyArtifactToLearningContentInput, subjectId: string, topicId: string): Promise<void> {
  const existing = await input.learningContent.getTopicDetails(input.deviceId, subjectId, topicId);
  if (!existing) {
    throw new WorkflowFail('precondition:missing-topic', `Topic Details row missing for ${subjectId}/${topicId}`);
  }
  await input.learningContent.putTopicDetails({
    deviceId: input.deviceId,
    subjectId,
    topicId,
    details: existing.details,
    contentHash: existing.contentHash,
    status: 'ready',
    updatedByRunId: input.runId,
  });
}

async function applyTopicCards(input: ApplyArtifactToLearningContentInput): Promise<void> {
  const subjectId = snapshotSubjectId(input.snapshot);
  const topicId = snapshotTopicId(input.snapshot);
  await input.learningContent.upsertTopicCards({
    deviceId: input.deviceId,
    subjectId,
    topicId,
    cards: await cardRowsFromPayload(input.artifactKind, input.payload, { subjectId, topicId, snapshot: input.snapshot }),
    createdByRunId: input.runId,
  });
  if (input.artifactKind === 'topic-study-cards') {
    await markTopicReady(input, subjectId, topicId);
  }
}

async function applyCrystalTrial(input: ApplyArtifactToLearningContentInput): Promise<void> {
  const subjectId = snapshotSubjectId(input.snapshot);
  const topicId = snapshotTopicId(input.snapshot);
  await input.learningContent.putCrystalTrialSet({
    deviceId: input.deviceId,
    subjectId,
    topicId,
    targetLevel: requirePositiveInteger(input.snapshot.target_level, 'snapshot.target_level'),
    cardPoolHash: requireString(input.snapshot.card_pool_hash, 'snapshot.card_pool_hash'),
    questions: input.payload,
    contentHash: input.contentHash,
    createdByRunId: input.runId,
  });
}

function nodesFromTopics(topicsPayload: Record<string, unknown>, edgesPayload: Record<string, unknown>): JsonObject[] {
  const topics = topicsPayload.topics;
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new WorkflowFail('validation:semantic-subject-graph', 'subject-graph-topics.topics must be a non-empty array');
  }
  const edges = edgesPayload.edges;
  if (!Array.isArray(edges)) {
    throw new WorkflowFail('validation:semantic-subject-graph', 'subject-graph-edges.edges must be an array');
  }

  return topics.map((topic, index) => {
    const row = requireRecord(topic, `subject-graph-topics.topics[${index}]`);
    const topicId = requireString(row.topicId, `subject-graph-topics.topics[${index}].topicId`);
    const prerequisites = edges
      .filter((edge): edge is Record<string, unknown> => isRecord(edge) && edge.target === topicId)
      .map((edge) => ({
        topicId: requireString(edge.source, 'subject-graph-edges.edges[].source'),
        minLevel: edge.minLevel === undefined ? 1 : requirePositiveInteger(edge.minLevel, 'subject-graph-edges.edges[].minLevel'),
      }));
    return {
      topicId,
      title: requireString(row.title, `subject-graph-topics.topics[${index}].title`),
      iconName: requireString(row.iconName, `subject-graph-topics.topics[${index}].iconName`),
      tier: requirePositiveInteger(row.tier, `subject-graph-topics.topics[${index}].tier`),
      prerequisites,
      learningObjective: requireString(row.learningObjective, `subject-graph-topics.topics[${index}].learningObjective`),
    };
  });
}

export async function publishCompleteSubjectGraphToLearningContent(input: PublishCompleteSubjectGraphInput): Promise<void> {
  const subjectId = snapshotSubjectId(input.snapshot);
  const checklist = checklistFromSnapshot(input.snapshot);
  const strategy = strategyBriefFromSnapshot(input.snapshot);
  const title = requireString(checklist.topic_name, 'snapshot.checklist.topic_name');
  const description = requireString(strategy.audience_brief, 'snapshot.strategy_brief.audience_brief');
  const nodes = nodesFromTopics(input.topicsPayload, input.edgesPayload);
  const maxTier = Math.max(...nodes.map((node) => node.tier as number), 1);
  const graph: JsonObject = { subjectId, title, themeId: 'default', maxTier, nodes };
  const topicIds = nodes.map((node) => requireString(node.topicId, 'subject graph nodes[].topicId'));

  const topicDetails = await Promise.all(nodes.map(async (node) => {
    const details: JsonObject = {
      topicId: node.topicId,
      title: node.title,
      subjectId,
      coreConcept: node.learningObjective,
      theory: '',
      keyTakeaways: [],
    };
    return {
      deviceId: input.deviceId,
      subjectId,
      topicId: node.topicId as string,
      details,
      contentHash: await computeContentHash(details),
      status: 'unavailable' as const,
      updatedByRunId: input.runId,
    };
  }));

  await input.learningContent.publishGeneratedSubjectGraph({
    subject: {
      deviceId: input.deviceId,
      subjectId,
      title,
      contentSource: 'generated',
      createdByRunId: input.runId,
      metadata: {
        subject: {
          description,
          color: '#6366f1',
          geometry: { gridTile: 'box' },
          topicIds,
          metadata: {
            checklist,
            strategy: {
              graph: {
                totalTiers: requirePositiveInteger(strategy.total_tiers, 'snapshot.strategy_brief.total_tiers'),
                topicsPerTier: requirePositiveInteger(strategy.topics_per_tier, 'snapshot.strategy_brief.topics_per_tier'),
                audienceBrief: description,
                domainBrief: requireString(strategy.domain_brief, 'snapshot.strategy_brief.domain_brief'),
                focusConstraints: requireStringValue(strategy.focus_constraints, 'snapshot.strategy_brief.focus_constraints'),
              },
            },
            generation: {
              createdByRunId: input.runId,
              sourceArtifactKinds: ['subject-graph-topics', 'subject-graph-edges'],
              topicsContentHash: input.topicsContentHash,
              edgesContentHash: input.edgesContentHash,
            },
          },
        },
      },
    },
    graph: {
      deviceId: input.deviceId,
      subjectId,
      graph,
      contentHash: await computeContentHash(graph),
      updatedByRunId: input.runId,
    },
    topicDetails,
  });
}

export async function applyArtifactToLearningContent(input: ApplyArtifactToLearningContentInput): Promise<void> {
  if (input.artifactKind === 'topic-theory') {
    await applyTopicTheory(input);
    return;
  }
  if (TOPIC_CARD_ARTIFACT_KINDS.has(input.artifactKind)) {
    await applyTopicCards(input);
    return;
  }
  if (input.artifactKind === 'crystal-trial') {
    await applyCrystalTrial(input);
    return;
  }
  if (input.artifactKind === 'subject-graph-topics' || input.artifactKind === 'subject-graph-edges') {
    throw new WorkflowFail(
      'state:unexpected-workflow-error',
      `${input.artifactKind} must be published via publishCompleteSubjectGraphToLearningContent`,
    );
  }

  throw new WorkflowFail('validation:semantic-topic-content', `unsupported artifact kind: ${String(input.artifactKind)}`);
}
