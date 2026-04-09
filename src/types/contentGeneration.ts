/**
 * Canonical types for the unified content generation job system.
 * Zero framework/runtime logic — pure data contracts.
 */

/** Discriminated union of all job kinds. Extend this as new generation types are added. */
export type ContentGenerationJobKind =
  | 'topic-theory'
  | 'topic-study-cards'
  | 'topic-mini-games'
  | 'topic-expansion-cards';

export type ContentGenerationJobStatus =
  | 'pending'
  | 'streaming'
  | 'parsing'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'aborted';

/** One LLM prompt invocation = one job. */
export interface ContentGenerationJob {
  /** Unique job ID (uuid). */
  id: string;
  /** Groups sequential jobs (e.g., topic unlock pipeline). Null for standalone jobs. */
  pipelineId: string | null;
  /** Discriminant for which runner/prompt this job uses. */
  kind: ContentGenerationJobKind;
  status: ContentGenerationJobStatus;

  /** Human-readable label for HUD/timeline (e.g., "Theory — Linear Algebra"). */
  label: string;

  /** Context identifiers — not every job needs all of these. */
  subjectId: string | null;
  topicId: string | null;

  /** Timestamps (epoch ms). */
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;

  /** Serialized input messages (JSON string). */
  inputMessages: string | null;
  /** Accumulated raw LLM output (grows during streaming). */
  rawOutput: string;
  /** Reasoning/thinking text if model supports it. */
  reasoningText: string | null;

  /** Terminal error message. */
  error: string | null;
  /** Parse-specific error (distinct from LLM/network errors). */
  parseError: string | null;
}

/** Lightweight reference for pipeline grouping (HUD header + pipeline-level abort). */
export interface ContentGenerationPipeline {
  id: string;
  label: string;
  createdAt: number;
}
