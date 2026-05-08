import { WorkflowFail } from '../lib/workflowErrors';
import { contentHash as computeContentHash, type ArtifactKind } from '../contracts/generationContracts';
import type { ILearningContentRepo } from './learningContentRepo';
import type { JsonObject, LearningContentSubject, PutTopicCardInput, TopicDetailsContent } from './types';

const TOPIC_CARD_ARTIFACT_KINDS = new Set<ArtifactKind>([
  'topic-study-cards',
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

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be a positive integer`);
  }
  return value as number;
}

async function requireSubject(repo: ILearningContentRepo, deviceId: string, subjectId: string): Promise<LearningContentSubject> {
  const manifest = await repo.getManifest(deviceId);
  const subject = manifest.subjects.find((row) => row.subjectId === subjectId);
  if (!subject) throw new WorkflowFail('precondition:missing-topic', `Learning Content subject not found: ${subjectId}`);
  return subject;
}

function snapshotSubjectId(snapshot: Record<string, unknown>): string {
  return requireString(snapshot.subject_id, 'snapshot.subject_id');
}

function snapshotTopicId(snapshot: Record<string, unknown>): string {
  return requireString(snapshot.topic_id, 'snapshot.topic_id');
}

function graphTitleFromSubject(subject: LearningContentSubject): string {
  return subject.title;
}

function topicDetailsFromTheory(
  snapshot: Record<string, unknown>,
  payload: Record<string, unknown>,
  existing: TopicDetailsContent | null,
): JsonObject {
  return {
    ...(existing?.details ?? {}),
    topicId: snapshotTopicId(snapshot),
    subjectId: snapshotSubjectId(snapshot),
    title: optionalString((existing?.details as Record<string, unknown> | undefined)?.title)
      ?? optionalString(snapshot.topic_title)
      ?? snapshotTopicId(snapshot),
    coreConcept: requireString(payload.coreConcept, 'topic-theory.coreConcept'),
    theory: requireString(payload.theory, 'topic-theory.theory'),
    keyTakeaways: payload.keyTakeaways,
    coreQuestionsByDifficulty: payload.coreQuestionsByDifficulty,
  } as JsonObject;
}

function deckStudyCardFromCanonical(card: Record<string, unknown>, label: string): JsonObject | null {
  const id = requireString(card.id, `${label}.id`);
  const difficulty = requirePositiveInteger(card.difficulty, `${label}.difficulty`);
  const type = requireString(card.type, `${label}.type`);
  const content = requireRecord(card.content, `${label}.content`);

  if (type === 'FLASHCARD') {
    return {
      id,
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
        id,
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
        id,
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
  const id = requireString(card.id, `${label}.id`);
  const difficulty = requirePositiveInteger(card.difficulty, `${label}.difficulty`);
  const content = requireRecord(card.content, `${label}.content`);
  requireString(content.gameType, `${label}.content.gameType`);
  return { id, type: 'MINI_GAME', difficulty, content };
}

function cardRowsFromPayload(artifactKind: ArtifactKind, payload: Record<string, unknown>): PutTopicCardInput[] {
  const cards = payload.cards;
  if (!Array.isArray(cards)) {
    throw new WorkflowFail('validation:semantic-topic-content', `${artifactKind}.cards must be an array`);
  }

  const rows: PutTopicCardInput[] = [];
  cards.forEach((value, index) => {
    const canonical = requireRecord(value, `${artifactKind}.cards[${index}]`);
    const deckCard = artifactKind === 'topic-study-cards' || artifactKind === 'topic-expansion-cards'
      ? deckStudyCardFromCanonical(canonical, `${artifactKind}.cards[${index}]`)
      : deckMiniGameCardFromCanonical(canonical, `${artifactKind}.cards[${index}]`);
    if (!deckCard) return;
    rows.push({
      cardId: requireString(deckCard.id, `${artifactKind}.cards[${index}].id`),
      card: deckCard,
      difficulty: requirePositiveInteger(deckCard.difficulty, `${artifactKind}.cards[${index}].difficulty`),
      sourceArtifactKind: artifactKind,
    });
  });

  if (rows.length === 0) {
    throw new WorkflowFail('validation:semantic-topic-content', `${artifactKind} produced no deck-compatible cards`);
  }
  return rows;
}

async function applyTopicTheory(input: ApplyArtifactToLearningContentInput): Promise<void> {
  const subjectId = snapshotSubjectId(input.snapshot);
  const topicId = snapshotTopicId(input.snapshot);
  const existing = await input.learningContent.getTopicDetails(input.deviceId, subjectId, topicId);
  const details = topicDetailsFromTheory(input.snapshot, input.payload, existing);
  await input.learningContent.putTopicDetails({
    deviceId: input.deviceId,
    subjectId,
    topicId,
    details,
    contentHash: input.contentHash,
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
    cards: cardRowsFromPayload(input.artifactKind, input.payload),
    createdByRunId: input.runId,
  });
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

async function applySubjectGraphTopics(input: ApplyArtifactToLearningContentInput): Promise<void> {
  const subjectId = snapshotSubjectId(input.snapshot);
  const subject = await requireSubject(input.learningContent, input.deviceId, subjectId);
  const existing = await input.learningContent.getSubjectGraph(input.deviceId, subjectId);
  const existingGraph = isRecord(existing?.graph) ? existing.graph : undefined;
  const existingNodes = Array.isArray(existingGraph?.nodes) ? existingGraph.nodes.filter(isRecord) : [];
  const topics = input.payload.topics;
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new WorkflowFail('validation:semantic-subject-graph', 'subject-graph-topics.topics must be a non-empty array');
  }
  const newNodes = topics.map((topic, index) => {
    const row = requireRecord(topic, `subject-graph-topics.topics[${index}]`);
    return {
      topicId: requireString(row.topicId, `subject-graph-topics.topics[${index}].topicId`),
      title: requireString(row.title, `subject-graph-topics.topics[${index}].title`),
      iconName: requireString(row.iconName, `subject-graph-topics.topics[${index}].iconName`),
      tier: requirePositiveInteger(row.tier, `subject-graph-topics.topics[${index}].tier`),
      prerequisites: [],
      learningObjective: requireString(row.learningObjective, `subject-graph-topics.topics[${index}].learningObjective`),
    };
  });
  const newTopicIds = new Set(newNodes.map((node) => node.topicId));
  const nodes = existingNodes.filter((node) => typeof node.topicId === 'string' && !newTopicIds.has(node.topicId));
  nodes.push(...newNodes);
  const maxTier = Math.max(...nodes.map((node) => Number.isInteger(node.tier) ? node.tier as number : 1), 1);
  const graph: JsonObject = {
    subjectId,
    title: optionalString(existingGraph?.title) ?? graphTitleFromSubject(subject),
    themeId: optionalString(existingGraph?.themeId) ?? 'default',
    maxTier,
    nodes,
  };

  await input.learningContent.putSubjectGraph({
    deviceId: input.deviceId,
    subjectId,
    graph,
    contentHash: input.contentHash,
    updatedByRunId: input.runId,
  });

  await Promise.all(newNodes.map(async (node) => {
    const details: JsonObject = {
      topicId: node.topicId,
      title: node.title,
      subjectId,
      coreConcept: node.learningObjective,
      theory: '',
      keyTakeaways: [],
    };
    await input.learningContent.putTopicDetails({
      deviceId: input.deviceId,
      subjectId,
      topicId: node.topicId,
      details,
      contentHash: await computeContentHash(details),
      status: 'unavailable',
      updatedByRunId: input.runId,
    });
  }));
}

async function applySubjectGraphEdges(input: ApplyArtifactToLearningContentInput): Promise<void> {
  const subjectId = snapshotSubjectId(input.snapshot);
  const existing = await input.learningContent.getSubjectGraph(input.deviceId, subjectId);
  if (!existing || !isRecord(existing.graph)) {
    throw new WorkflowFail('precondition:missing-topic', `Learning Content subject graph not found before applying edges: ${subjectId}`);
  }
  const nodes = existing.graph.nodes;
  if (!Array.isArray(nodes) || nodes.some((node) => !isRecord(node))) {
    throw new WorkflowFail('precondition:missing-topic', `Learning Content subject graph ${subjectId}.nodes must be an array of objects`);
  }
  const edges = input.payload.edges;
  if (!Array.isArray(edges)) {
    throw new WorkflowFail('validation:semantic-subject-graph', 'subject-graph-edges.edges must be an array');
  }

  const graph: JsonObject = {
    ...existing.graph,
    nodes: nodes.map((node) => {
      const topicId = requireString((node as Record<string, unknown>).topicId, `subject graph ${subjectId}.nodes[].topicId`);
      const prerequisites = edges
        .filter((edge): edge is Record<string, unknown> => isRecord(edge) && edge.target === topicId)
        .map((edge) => {
          const source = requireString(edge.source, 'subject-graph-edges.edges[].source');
          return edge.minLevel === undefined ? source : { topicId: source, minLevel: requirePositiveInteger(edge.minLevel, 'subject-graph-edges.edges[].minLevel') };
        });
      return { ...node, prerequisites };
    }),
  };

  await input.learningContent.putSubjectGraph({
    deviceId: input.deviceId,
    subjectId,
    graph,
    contentHash: input.contentHash,
    updatedByRunId: input.runId,
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
  if (input.artifactKind === 'subject-graph-topics') {
    await applySubjectGraphTopics(input);
    return;
  }
  if (input.artifactKind === 'subject-graph-edges') {
    await applySubjectGraphEdges(input);
    return;
  }

  throw new WorkflowFail('validation:semantic-topic-content', `unsupported artifact kind: ${String(input.artifactKind)}`);
}
