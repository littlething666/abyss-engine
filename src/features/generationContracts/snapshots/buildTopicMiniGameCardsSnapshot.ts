import type { TopicMiniGameCardsRunInputSnapshot } from './types';
import {
  assertBoolean,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertNonNegativeInteger,
  assertPositiveInteger,
  assertStringArray,
} from './_validators';

export type MiniGamePipelineKind =
  TopicMiniGameCardsRunInputSnapshot['pipeline_kind'];

const ALLOWED_KINDS: ReadonlyArray<MiniGamePipelineKind> = [
  'topic-mini-game-category-sort',
  'topic-mini-game-sequence-build',
  'topic-mini-game-match-pairs',
];

export interface BuildTopicMiniGameCardsSnapshotParams {
  /**
   * Discriminates the mini-game kind (category-sort / sequence-build /
   * match-pairs). Each kind is a distinct ArtifactKind because their
   * downstream payloads differ; per-kind hashing keeps regeneration scoped.
   */
  pipelineKind: MiniGamePipelineKind;
  subjectId: string;
  topicId: string;
  schemaVersion: number;
  promptTemplateVersion: string;
  modelId: string;
  capturedAt: string;
  theoryExcerpt: string;
  syllabusQuestions: string[];
  targetDifficulty: number;
  groundingSourceCount: number;
  hasAuthoritativePrimarySource: boolean;
}

export function buildTopicMiniGameCardsSnapshot(
  p: BuildTopicMiniGameCardsSnapshotParams,
): TopicMiniGameCardsRunInputSnapshot {
  if (!ALLOWED_KINDS.includes(p.pipelineKind)) {
    throw new Error(
      `Snapshot field "pipelineKind" must be one of ${ALLOWED_KINDS.join(', ')}, received "${String(p.pipelineKind)}"`,
    );
  }
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
    pipeline_kind: p.pipelineKind,
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
