import type { SubjectGraphTopicsRunInputSnapshot } from './types';
import {
  assertIsoTimestamp,
  assertNonEmptyString,
  assertPositiveInteger,
} from './_validators';

export interface BuildSubjectGraphTopicsSnapshotParams {
  subjectId: string;
  schemaVersion: number;
  promptTemplateVersion: string;
  modelId: string;
  capturedAt: string;
  checklist: {
    topic_name: string;
    study_goal?: string;
    prior_knowledge?: string;
    learning_style?: string;
    focus_areas?: string;
  };
  strategyBrief: {
    total_tiers: number;
    topics_per_tier: number;
    audience_brief: string;
    domain_brief: string;
    focus_constraints: string;
  };
}

/**
 * Build a deterministic snapshot for the Subject Graph topics-lattice stage.
 *
 * The snapshot fully determines `input_hash`, so any change to model,
 * prompt template, schema, checklist, or strategy brief must be reflected
 * in the inputs to this builder.
 */
export function buildSubjectGraphTopicsSnapshot(
  p: BuildSubjectGraphTopicsSnapshotParams,
): SubjectGraphTopicsRunInputSnapshot {
  assertNonEmptyString('subjectId', p.subjectId);
  assertPositiveInteger('schemaVersion', p.schemaVersion);
  assertNonEmptyString('promptTemplateVersion', p.promptTemplateVersion);
  assertNonEmptyString('modelId', p.modelId);
  assertIsoTimestamp('capturedAt', p.capturedAt);
  assertNonEmptyString('checklist.topic_name', p.checklist.topic_name);
  assertPositiveInteger('strategyBrief.total_tiers', p.strategyBrief.total_tiers);
  assertPositiveInteger(
    'strategyBrief.topics_per_tier',
    p.strategyBrief.topics_per_tier,
  );
  assertNonEmptyString(
    'strategyBrief.audience_brief',
    p.strategyBrief.audience_brief,
  );
  assertNonEmptyString(
    'strategyBrief.domain_brief',
    p.strategyBrief.domain_brief,
  );
  assertNonEmptyString(
    'strategyBrief.focus_constraints',
    p.strategyBrief.focus_constraints,
  );

  return {
    snapshot_version: 1,
    pipeline_kind: 'subject-graph-topics',
    schema_version: p.schemaVersion,
    prompt_template_version: p.promptTemplateVersion,
    model_id: p.modelId,
    captured_at: p.capturedAt,
    subject_id: p.subjectId,
    checklist: { ...p.checklist },
    strategy_brief: { ...p.strategyBrief },
  };
}
