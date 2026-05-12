import type { TopicExpansionRunInputSnapshot } from './types';
import {
  assertIsoTimestamp,
  assertNonEmptyString,
  assertNonNegativeInteger,
  assertPositiveInteger,
  assertStringArray,
} from './_validators';

export interface BuildTopicExpansionSnapshotParams {
  subjectId: string;
  topicId: string;
  schemaVersion: number;
  promptTemplateVersion: string;
  modelId: string;
  capturedAt: string;
  /** Crystal Level the expansion is producing cards for. */
  nextLevel: number;
  /** Difficulty bucket within the level (snapshot is sensitive to this). */
  difficulty: number;
  theoryExcerpt: string;
  syllabusQuestions: string[];
  /** Card ids existing at snapshot time; adding a card invalidates input_hash. */
  existingCardIds: string[];
  /** Normalized concept stems used to deduplicate against existing cards. */
  existingConceptStems: string[];
  groundingSourceCount: number;
}

export function buildTopicExpansionSnapshot(
  p: BuildTopicExpansionSnapshotParams,
): TopicExpansionRunInputSnapshot {
  assertNonEmptyString('subjectId', p.subjectId);
  assertNonEmptyString('topicId', p.topicId);
  assertPositiveInteger('schemaVersion', p.schemaVersion);
  assertNonEmptyString('promptTemplateVersion', p.promptTemplateVersion);
  assertNonEmptyString('modelId', p.modelId);
  assertIsoTimestamp('capturedAt', p.capturedAt);
  assertPositiveInteger('nextLevel', p.nextLevel);
  assertNonNegativeInteger('difficulty', p.difficulty);
  assertNonEmptyString('theoryExcerpt', p.theoryExcerpt);
  assertStringArray('syllabusQuestions', p.syllabusQuestions);
  assertStringArray('existingCardIds', p.existingCardIds);
  assertStringArray('existingConceptStems', p.existingConceptStems);
  assertNonNegativeInteger('groundingSourceCount', p.groundingSourceCount);

  return {
    snapshot_version: 1,
    pipeline_kind: 'topic-expansion-cards',
    schema_version: p.schemaVersion,
    prompt_template_version: p.promptTemplateVersion,
    model_id: p.modelId,
    captured_at: p.capturedAt,
    subject_id: p.subjectId,
    topic_id: p.topicId,
    next_level: p.nextLevel,
    difficulty: p.difficulty,
    theory_excerpt: p.theoryExcerpt,
    syllabus_questions: [...p.syllabusQuestions],
    existing_card_ids: [...p.existingCardIds],
    existing_concept_stems: [...p.existingConceptStems],
    grounding_source_count: p.groundingSourceCount,
  };
}
