/**
 * `RunInputSnapshot` captures every deterministic input required to build
 * prompts and compute `input_hash`. The Worker MUST NOT infer any state from
 * browser IndexedDB at runtime; if a value matters for prompt construction,
 * it lives here.
 *
 * Versioning rules:
 * - `snapshot_version` ratchets when the snapshot envelope itself changes
 *   (new top-level fields, removed required fields).
 * - `schema_version` is the per-pipeline artifact schema version.
 * - `prompt_template_version` ratchets when the bound prompt template
 *   changes in a way that affects model output.
 *
 * Bumping any of `model_id`, `prompt_template_version`, `schema_version`, or
 * any source-data field changes the canonical hash and forces regeneration.
 */

import type { ArtifactKind } from '../artifacts/types';

export type RunInputSnapshotEnvelope = {
  snapshot_version: 1;
  pipeline_kind: ArtifactKind;
  schema_version: number;
  prompt_template_version: string;
  model_id: string;
  /** ISO-8601 timestamp captured at snapshot construction (informational only). */
  captured_at: string;
};

export type SubjectGraphTopicsRunInputSnapshot = RunInputSnapshotEnvelope & {
  pipeline_kind: 'subject-graph-topics';
  subject_id: string;
  checklist: {
    topic_name: string;
    study_goal?: string;
    prior_knowledge?: string;
    learning_style?: string;
    focus_areas?: string;
  };
  strategy_brief: {
    total_tiers: number;
    topics_per_tier: number;
    audience_brief: string;
    domain_brief: string;
    focus_constraints: string;
  };
};

export type SubjectGraphEdgesRunInputSnapshot = RunInputSnapshotEnvelope & {
  pipeline_kind: 'subject-graph-edges';
  subject_id: string;
  /** Hash tag of the lattice artifact this edges run depends on. */
  lattice_artifact_content_hash: string;
};

export type TopicTheoryRunInputSnapshot = RunInputSnapshotEnvelope & {
  pipeline_kind: 'topic-theory';
  subject_id: string;
  topic_id: string;
  topic_title: string;
  learning_objective: string;
  content_brief?: string;
};

export type TopicStudyCardsRunInputSnapshot = RunInputSnapshotEnvelope & {
  pipeline_kind: 'topic-study-cards';
  subject_id: string;
  topic_id: string;
  /** Theory excerpt — included verbatim so prompt is reproducible. */
  theory_excerpt: string;
  syllabus_questions: string[];
  target_difficulty: number;
  grounding_source_count: number;
  has_authoritative_primary_source: boolean;
};

export type TopicMiniGameCardsRunInputSnapshot = RunInputSnapshotEnvelope & {
  pipeline_kind:
    | 'topic-mini-game-category-sort'
    | 'topic-mini-game-sequence-build'
    | 'topic-mini-game-match-pairs';
  subject_id: string;
  topic_id: string;
  theory_excerpt: string;
  syllabus_questions: string[];
  target_difficulty: number;
  grounding_source_count: number;
  has_authoritative_primary_source: boolean;
};

export type TopicExpansionRunInputSnapshot = RunInputSnapshotEnvelope & {
  pipeline_kind: 'topic-expansion-cards';
  subject_id: string;
  topic_id: string;
  next_level: number;
  difficulty: number;
  theory_excerpt: string;
  syllabus_questions: string[];
  /** Hashes of every existing card so adding a card invalidates the snapshot. */
  existing_card_ids: string[];
  /** Stable concept stems (already normalized) used for de-duplication. */
  existing_concept_stems: string[];
  grounding_source_count: number;
};

export type CrystalTrialRunInputSnapshot = RunInputSnapshotEnvelope & {
  pipeline_kind: 'crystal-trial';
  subject_id: string;
  topic_id: string;
  current_level: number;
  target_level: number;
  /** Stable hash of the card pool the trial questions are derived from. */
  card_pool_hash: string;
  question_count: number;
  content_brief?: string;
};

export type RunInputSnapshot =
  | SubjectGraphTopicsRunInputSnapshot
  | SubjectGraphEdgesRunInputSnapshot
  | TopicTheoryRunInputSnapshot
  | TopicStudyCardsRunInputSnapshot
  | TopicMiniGameCardsRunInputSnapshot
  | TopicExpansionRunInputSnapshot
  | CrystalTrialRunInputSnapshot;
