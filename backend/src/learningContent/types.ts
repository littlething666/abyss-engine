export type JsonObject = Record<string, unknown>;
export type SubjectContentSource = 'bundled' | 'generated' | 'manual';
export type TopicContentStatus = 'ready' | 'generating' | 'unavailable';

export interface LearningContentSubject {
  deviceId: string;
  subjectId: string;
  title: string;
  metadata: JsonObject;
  contentSource: SubjectContentSource;
  createdByRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LearningContentManifest {
  subjects: LearningContentSubject[];
}

export interface SubjectGraphContent {
  deviceId: string;
  subjectId: string;
  graph: JsonObject;
  contentHash: string;
  updatedByRunId: string;
  updatedAt: string;
}

export interface TopicDetailsContent {
  deviceId: string;
  subjectId: string;
  topicId: string;
  details: JsonObject;
  contentHash: string;
  status: TopicContentStatus;
  updatedByRunId: string;
  updatedAt: string;
}

export interface TopicCardContent {
  deviceId: string;
  subjectId: string;
  topicId: string;
  cardId: string;
  card: JsonObject;
  difficulty: number;
  sourceArtifactKind: string;
  createdByRunId: string;
  createdAt: string;
}

export interface CrystalTrialSetContent {
  deviceId: string;
  subjectId: string;
  topicId: string;
  targetLevel: number;
  cardPoolHash: string;
  questions: JsonObject;
  contentHash: string;
  createdByRunId: string;
  createdAt: string;
}

export interface UpsertSubjectInput {
  deviceId: string;
  subjectId: string;
  title: string;
  metadata?: JsonObject;
  contentSource: SubjectContentSource;
  createdByRunId?: string | null;
}

export interface PutSubjectGraphInput {
  deviceId: string;
  subjectId: string;
  graph: JsonObject;
  contentHash: string;
  updatedByRunId: string;
}

export interface PutTopicDetailsInput {
  deviceId: string;
  subjectId: string;
  topicId: string;
  details: JsonObject;
  contentHash: string;
  status: TopicContentStatus;
  updatedByRunId: string;
}

export interface PutTopicCardInput {
  cardId: string;
  card: JsonObject;
  difficulty: number;
  sourceArtifactKind: string;
}

export interface PutTopicCardsInput {
  deviceId: string;
  subjectId: string;
  topicId: string;
  cards: PutTopicCardInput[];
  createdByRunId: string;
}

export interface PutCrystalTrialSetInput {
  deviceId: string;
  subjectId: string;
  topicId: string;
  targetLevel: number;
  cardPoolHash: string;
  questions: JsonObject;
  contentHash: string;
  createdByRunId: string;
}
