import type { TopicTheoryRunInputSnapshot } from './types';
import {
  assertIsoTimestamp,
  assertNonEmptyString,
  assertPositiveInteger,
} from './_validators';

export interface BuildTopicTheorySnapshotParams {
  subjectId: string;
  topicId: string;
  schemaVersion: number;
  promptTemplateVersion: string;
  modelId: string;
  capturedAt: string;
  topicTitle: string;
  learningObjective: string;
  /** Optional brief that further constrains theory generation. */
  contentBrief?: string;
}

export function buildTopicTheorySnapshot(
  p: BuildTopicTheorySnapshotParams,
): TopicTheoryRunInputSnapshot {
  assertNonEmptyString('subjectId', p.subjectId);
  assertNonEmptyString('topicId', p.topicId);
  assertPositiveInteger('schemaVersion', p.schemaVersion);
  assertNonEmptyString('promptTemplateVersion', p.promptTemplateVersion);
  assertNonEmptyString('modelId', p.modelId);
  assertIsoTimestamp('capturedAt', p.capturedAt);
  assertNonEmptyString('topicTitle', p.topicTitle);
  assertNonEmptyString('learningObjective', p.learningObjective);
  if (p.contentBrief !== undefined) {
    assertNonEmptyString('contentBrief', p.contentBrief);
  }

  return {
    snapshot_version: 1,
    pipeline_kind: 'topic-theory',
    schema_version: p.schemaVersion,
    prompt_template_version: p.promptTemplateVersion,
    model_id: p.modelId,
    captured_at: p.capturedAt,
    subject_id: p.subjectId,
    topic_id: p.topicId,
    topic_title: p.topicTitle,
    learning_objective: p.learningObjective,
    ...(p.contentBrief !== undefined ? { content_brief: p.contentBrief } : {}),
  };
}
