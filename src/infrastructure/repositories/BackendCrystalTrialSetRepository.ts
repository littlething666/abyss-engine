import type { ApiClient } from '../http/apiClient';
import { ApiError } from '../http/apiClient';
import type { CrystalTrialScenarioQuestion } from '../../types/crystalTrial';
import type { CrystalTrialSetReadModel, ICrystalTrialSetRepository } from '../../types/repository';

interface BackendCrystalTrialSetRepositoryDeps {
  http: ApiClient;
}

interface BackendCrystalTrialSetResponse {
  subjectId: string;
  topicId: string;
  targetLevel: number;
  cardPoolHash: string;
  questions: { questions: unknown[] };
  contentHash: string;
  createdByRunId: string;
  createdAt: string;
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return value;
}

function requireQuestion(value: unknown, label: string): CrystalTrialScenarioQuestion {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`);
  const options = requireStringArray(value.options, `${label}.options`);
  const correctAnswer = requireString(value.correctAnswer, `${label}.correctAnswer`);
  if (!options.includes(correctAnswer)) {
    throw new Error(`${label}.correctAnswer must match one of ${label}.options`);
  }
  return {
    id: requireString(value.id, `${label}.id`),
    category: requireString(value.category, `${label}.category`) as CrystalTrialScenarioQuestion['category'],
    scenario: requireString(value.scenario, `${label}.scenario`),
    question: requireString(value.question, `${label}.question`),
    options,
    correctAnswer,
    explanation: requireString(value.explanation, `${label}.explanation`),
    sourceCardSummaries: requireStringArray(value.sourceCardSummaries, `${label}.sourceCardSummaries`),
  };
}

function requireResponse(value: unknown): BackendCrystalTrialSetResponse {
  if (!isRecord(value)) throw new Error('Learning Content Crystal Trial response must be a JSON object');
  const questionsEnvelope = value.questions;
  if (!isRecord(questionsEnvelope) || !Array.isArray(questionsEnvelope.questions)) {
    throw new Error('Learning Content Crystal Trial response.questions.questions must be an array');
  }
  return {
    subjectId: requireString(value.subjectId, 'Learning Content Crystal Trial response.subjectId'),
    topicId: requireString(value.topicId, 'Learning Content Crystal Trial response.topicId'),
    targetLevel: requireNumber(value.targetLevel, 'Learning Content Crystal Trial response.targetLevel'),
    cardPoolHash: requireString(value.cardPoolHash, 'Learning Content Crystal Trial response.cardPoolHash'),
    questions: { questions: questionsEnvelope.questions },
    contentHash: requireString(value.contentHash, 'Learning Content Crystal Trial response.contentHash'),
    createdByRunId: requireString(value.createdByRunId, 'Learning Content Crystal Trial response.createdByRunId'),
    createdAt: requireString(value.createdAt, 'Learning Content Crystal Trial response.createdAt'),
  };
}

/** Backend Learning Content Store adapter for current Crystal Trial question sets. */
export class BackendCrystalTrialSetRepository implements ICrystalTrialSetRepository {
  private readonly http: ApiClient;

  constructor(deps: BackendCrystalTrialSetRepositoryDeps) {
    this.http = deps.http;
  }

  async getCurrentTrialSet(subjectId: string, topicId: string, targetLevel: number): Promise<CrystalTrialSetReadModel | null> {
    try {
      const payload = requireResponse(await this.http.get<unknown>(
        `/v1/subjects/${pathSegment(subjectId)}/topics/${pathSegment(topicId)}/trials/${targetLevel}/current`,
      ));
      return {
        subjectId: payload.subjectId,
        topicId: payload.topicId,
        targetLevel: payload.targetLevel,
        cardPoolHash: payload.cardPoolHash,
        questions: payload.questions.questions.map((question, index) => requireQuestion(question, `Learning Content Crystal Trial response.questions.questions[${index}]`)),
        contentHash: payload.contentHash,
        createdByRunId: payload.createdByRunId,
        createdAt: payload.createdAt,
      };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }
}
