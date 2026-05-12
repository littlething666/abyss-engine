import { canonicalJson, type ArtifactKind } from '../contracts/generationContracts';
import { WorkflowFail } from '../lib/workflowErrors';
import type { JsonObject } from './types';

const ENCODER = new TextEncoder();

function bytesToHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < view.length; i += 1) {
    const hex = view[i]!.toString(16);
    out += hex.length === 1 ? `0${hex}` : hex;
  }
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) {
    throw new WorkflowFail('config:invalid', 'WebCrypto subtle is unavailable for Learning Content deterministic ID hashing');
  }
  return bytesToHex(await subtle.digest('SHA-256', ENCODER.encode(input)));
}

export async function stableLearningContentId(prefix: string, ...parts: unknown[]): Promise<string> {
  return `${prefix}_${await sha256Hex(canonicalJson(parts))}`;
}

function normalizeForSignature(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .trim()
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\s+/g, ' ');
  }
  if (Array.isArray(value)) return value.map(normalizeForSignature);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, normalizeForSignature(entry)]),
    );
  }
  return value;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

function semanticSignatureBasis(card: JsonObject): unknown {
  const type = stringField(card, 'type') ?? 'UNKNOWN';
  const content = card.content && typeof card.content === 'object' && !Array.isArray(card.content)
    ? card.content as Record<string, unknown>
    : {};

  if (type === 'FLASHCARD') {
    return {
      mode: 'qa',
      question: stringField(content, 'front') ?? '',
      answer: stringField(content, 'back') ?? '',
    };
  }

  if (type === 'SINGLE_CHOICE') {
    return {
      mode: 'qa',
      question: stringField(content, 'question') ?? '',
      answer: stringField(content, 'correctAnswer') ?? '',
    };
  }

  if (type === 'MULTI_CHOICE') {
    return {
      mode: 'qa',
      question: stringField(content, 'question') ?? '',
      answers: [...(stringArrayField(content, 'correctAnswers') ?? [])].sort(),
    };
  }

  if (type === 'MINI_GAME') {
    return {
      mode: 'mini-game',
      gameType: stringField(content, 'gameType') ?? '',
      prompt: stringField(content, 'prompt') ?? '',
      content,
    };
  }

  return { type, content };
}

export async function computeQuestionSignature(card: JsonObject): Promise<string> {
  return stableLearningContentId('qsig', 'question-signature:v1', normalizeForSignature(semanticSignatureBasis(card)));
}

export interface BuildTopicCardMaterializationIdsInput {
  subjectId: string;
  topicId: string;
  artifactKind: ArtifactKind;
  cardIndex: number;
  card: JsonObject;
}

export interface TopicCardMaterializationIds {
  conceptId: string;
  cardSpecId?: string;
  miniGameSpecId?: string;
  cardId: string;
  questionSignature: string;
}

export async function buildTopicCardMaterializationIds(
  input: BuildTopicCardMaterializationIdsInput,
): Promise<TopicCardMaterializationIds> {
  const questionSignature = await computeQuestionSignature(input.card);
  const conceptId = await stableLearningContentId(
    'concept',
    'unplanned-topic-concept:v1',
    input.subjectId,
    input.topicId,
  );

  if (input.card.type === 'MINI_GAME') {
    const miniGameSpecId = await stableLearningContentId(
      'mini_game_spec',
      'legacy-mini-game-spec:v1',
      input.subjectId,
      input.topicId,
      input.artifactKind,
      input.cardIndex,
      questionSignature,
    );
    return {
      conceptId,
      miniGameSpecId,
      questionSignature,
      cardId: await stableLearningContentId('card', 'mini-game-card:v1', input.subjectId, input.topicId, miniGameSpecId, questionSignature),
    };
  }

  const cardSpecId = await stableLearningContentId(
    'card_spec',
    'legacy-card-spec:v1',
    input.subjectId,
    input.topicId,
    input.artifactKind,
    input.cardIndex,
    questionSignature,
  );
  return {
    conceptId,
    cardSpecId,
    questionSignature,
    cardId: await stableLearningContentId('card', 'study-card:v1', input.subjectId, input.topicId, cardSpecId, questionSignature),
  };
}
