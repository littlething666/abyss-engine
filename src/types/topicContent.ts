export type TopicContentStatus = 'ready' | 'generating' | 'unavailable';

export interface TopicContentStatusRecord {
  subjectId: string;
  topicId: string;
  status: TopicContentStatus;
  updatedAt?: string;
}

export const TOPIC_CONTENT_STATUSES = ['ready', 'generating', 'unavailable'] as const;

export function isTopicContentStatus(value: unknown): value is TopicContentStatus {
  return typeof value === 'string' && (TOPIC_CONTENT_STATUSES as readonly string[]).includes(value);
}
