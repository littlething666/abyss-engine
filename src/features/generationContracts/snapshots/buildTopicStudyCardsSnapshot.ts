import type { TopicStudyCardsRunInputSnapshot } from './types';
import {
  assertBoolean,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertNonNegativeInteger,
  assertPositiveInteger,
  assertStringArray,
} from './_validators';

export interface BuildTopicStudyCardsSnapshotParams {
  subjectId: string;
  topicId: string;
  schemaVersion: number;
  promptTemplateVersion: string;
  modelId: string;
  capturedAt: string;
  /**
   * Theory excerpt copied verbatim into the prompt. Captured here so an
   * edited theory artifact forces a new study-cards run via input_hash.
   */
  theoryExcerpt: string;
  syllabusQuestions: string[];
  targetDifficulty: number;
  groundingSourceCount: number;
  hasAuthoritativePrimarySource: boolean;
}

export function buildTopicStudyCardsSnapshot(
  p: BuildTopicStudyCardsSnapshotParams,
): TopicStudyCardsRunInputSnapshot {
  assertNonEmptyString('subjectId', p.subjectId);
  assertNonEmptyString('topicId', p.topicId);
  assertPositiveInteger('schemaVersion', p.schemaVersion);
  assertNonEmptyString('promptTemplateVersion', p.promptTemplateVersion);
  assertNonEmptyString('modelId', p.modelId);
  assertIsoTimestamp('capturedAt', p.capturedAt);
  assertNonEmptyString('theoryExcerpt', p.theoryExcerpt);
  assertStringArray('syllabusQuestions', p.syllabusQuestions);
  assertNonNegativeInteger('targetDifficulty', p.targetDifficulty);
  assertNonNegativeInteger('groundingSourceCount', p.groundingSourceCount);
  assertBoolean('hasAuthoritativePrimarySource', p.hasAuthoritativePrimarySource);

  return {
    snapshot_version: 1,
    pipeline_kind: 'topic-study-cards',
    schema_version: p.schemaVersion,
    prompt_template_version: p.promptTemplateVersion,
    model_id: p.modelId,
    captured_at: p.capturedAt,
    subject_id: p.subjectId,
    topic_id: p.topicId,
    theory_excerpt: p.theoryExcerpt,
    syllabus_questions: [...p.syllabusQuestions],
    target_difficulty: p.targetDifficulty,
    grounding_source_count: p.groundingSourceCount,
    has_authoritative_primary_source: p.hasAuthoritativePrimarySource,
  };
}
