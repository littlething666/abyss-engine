/**
 * Canonical types for the unified content generation job system.
 * Zero framework/runtime logic — pure data contracts.
 */

/** Discriminated union of all job kinds. Extend this as new generation types are added. */
export type ContentGenerationJobKind =
  | 'topic-theory'
  | 'topic-study-cards'
  | 'topic-mini-games'
  | 'topic-expansion-cards'
  | 'subject-graph'
  | 'crystal-trial';

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

  /** If this job is a retry, the ID of the original job it was retried from. */
  retryOf: string | null;

  /**
   * Lightweight key–value bag for retry context and kind-specific data.
   * Stored in Dexie automatically (not indexed).
   *
   * Known keys:
 * - `model` (string) — exact model identifier used for this job.
   * - `enableThinking` (boolean) — whether thinking/reasoning was enabled for this job.
   * - `nextLevel` (number) — for expansion jobs, the crystal level that triggered expansion.
   */
  metadata: Record<string, unknown> | null;
}

/** Lightweight reference for pipeline grouping (HUD header + pipeline-level abort). */
export interface ContentGenerationPipeline {
  id: string;
  label: string;
  createdAt: number;
  /** If this pipeline is a retry, the ID of the original pipeline it was retried from. */
  retryOf: string | null;
}
