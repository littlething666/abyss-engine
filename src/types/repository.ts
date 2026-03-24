import type { Card, Subject, SubjectGraph, TopicDetails } from './core';

export type {
  ChatCompletionStreamInput,
  ChatMessage,
  ChatMessageRole,
  IChatCompletionsRepository,
} from './llm';

export interface Manifest {
  subjects: Subject[];
}

export interface IDeckRepository {
  getManifest(): Promise<Manifest>;
  getSubjectGraph(subjectId: string): Promise<SubjectGraph>;
  getTopicDetails(subjectId: string, topicId: string): Promise<TopicDetails>;
  getTopicCards(subjectId: string, topicId: string): Promise<Card[]>;
}

export interface IDeckContentWriter {
  upsertSubject(subject: Subject & { themeId?: string }): Promise<void>;
  upsertGraph(graph: SubjectGraph): Promise<void>;
  upsertTopicDetails(details: TopicDetails): Promise<void>;
  upsertTopicCards(subjectId: string, topicId: string, cards: Card[]): Promise<void>;
}

export interface StudyHistoryQuery {
  daysWindow?: number;
  fromTimestamp?: number;
  toTimestamp?: number;
  eventTypes?: string[];
  topicId?: string | null;
  sessionId?: string | null;
  topicIds?: string[];
}

export interface StudyHistoryRepositoryRecord {
  id: string;
  version: 'v1';
  timestamp: number;
  sessionId: string | null;
  topicId: string | null;
  type: string;
  payload: Record<string, unknown>;
}

export interface IStudyHistoryRepository {
  getAll(): StudyHistoryRepositoryRecord[];
  getByQuery(options?: StudyHistoryQuery): StudyHistoryRepositoryRecord[];
  log(record: StudyHistoryRepositoryRecord): void;
  prune(days: number): void;
  clear(): void;
  exportLog(): string;
}
