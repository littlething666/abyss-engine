import type { CrystalTrialRunInputSnapshot } from './types';
import {
  assertContentHash,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertNonNegativeInteger,
  assertPositiveInteger,
} from './_validators';

export interface BuildCrystalTrialSnapshotParams {
  subjectId: string;
  topicId: string;
  schemaVersion: number;
  promptTemplateVersion: string;
  modelId: string;
  capturedAt: string;
  currentLevel: number;
  targetLevel: number;
  /**
   * Stable content hash (`cnt_<64-hex>`) of the card pool snapshot the
   * trial questions are derived from. Captured here so any change to the
   * card pool forces regeneration of the trial questions.
   */
  cardPoolHash: string;
  questionCount: number;
  /** Optional brief narrowing the question style. */
  contentBrief?: string;
}

export function buildCrystalTrialSnapshot(
  p: BuildCrystalTrialSnapshotParams,
): CrystalTrialRunInputSnapshot {
  assertNonEmptyString('subjectId', p.subjectId);
  assertNonEmptyString('topicId', p.topicId);
  assertPositiveInteger('schemaVersion', p.schemaVersion);
  assertNonEmptyString('promptTemplateVersion', p.promptTemplateVersion);
  assertNonEmptyString('modelId', p.modelId);
  assertIsoTimestamp('capturedAt', p.capturedAt);
  assertNonNegativeInteger('currentLevel', p.currentLevel);
  assertPositiveInteger('targetLevel', p.targetLevel);
  if (p.targetLevel <= p.currentLevel) {
    throw new Error(
      `Snapshot field "targetLevel" (${p.targetLevel}) must be greater than "currentLevel" (${p.currentLevel})`,
    );
  }
  assertContentHash('cardPoolHash', p.cardPoolHash);
  assertPositiveInteger('questionCount', p.questionCount);
  if (p.contentBrief !== undefined) {
    assertNonEmptyString('contentBrief', p.contentBrief);
  }

  return {
    snapshot_version: 1,
    pipeline_kind: 'crystal-trial',
    schema_version: p.schemaVersion,
    prompt_template_version: p.promptTemplateVersion,
    model_id: p.modelId,
    captured_at: p.capturedAt,
    subject_id: p.subjectId,
    topic_id: p.topicId,
    current_level: p.currentLevel,
    target_level: p.targetLevel,
    card_pool_hash: p.cardPoolHash,
    question_count: p.questionCount,
    ...(p.contentBrief !== undefined ? { content_brief: p.contentBrief } : {}),
  };
}
