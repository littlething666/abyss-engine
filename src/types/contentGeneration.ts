/**
 * Canonical types for the unified content generation job system.
 * Zero framework/runtime logic — pure data contracts.
 */

/** Discriminated union of all job kinds. Extend this as new generation types are added. */
export type ContentGenerationJobKind =
  | 'topic-theory'
  | 'topic-study-cards'
  | 'topic-mini-games'
  | 'topic-mini-game-category-sort'
  | 'topic-mini-game-sequence-build'
  | 'topic-mini-game-connection-web'
  | 'topic-expansion-cards'
  | 'subject-graph-topics'
  | 'subject-graph-edges'
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
  /** Reasoning text if model supports it. */
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
   * - `enableReasoning` (boolean) — whether OpenRouter `reasoning` was enabled for this job.
   * - `nextLevel` (number) — for expansion jobs, the crystal level that triggered expansion.
   * - `provider` (object) — normalized provider metadata such as usage, citations, or annotations.
   * - `grounding` (object) — accepted source counts, optional authoritative-primary flag, and source snapshots.
   * - `abortReason` (object) — typed {@link import('./contentGenerationAbort').ContentGenerationAbortReason} when status is `aborted`.
   * - `qualityReport` (object) — card validation counts, duplicate rates, and grounding coverage.
   * - `validationFailures` (array) — detailed card-level validation failures surfaced in the HUD.
   * - `debugBundle` (object) — allowlisted `PipelineFailureDebugBundle` when a job fails.
   * - `debugMarkdown` (string) — copy-ready markdown mirror of `debugBundle` for HUD / console.
   * - `prereqEdgesCorrection` (object) — when edges output was deterministically repaired
   *   (`removed` / `added` entries); see `correctPrereqEdges`.
   * - `structuredOutputMode` (string) — e.g. `json_schema` when structured output was requested.
   * - `structuredOutputSchemaName` (string) — OpenRouter `json_schema.name` when applicable.
   * - `responseHealingEnabled` (boolean) — whether `response-healing` plugin was attached.
   * - `structuredOutputContractViolation` (boolean) — true when `json_schema` was used and local parsing failed.
   * - `localParserError` (string) — parse error text when `structuredOutputContractViolation` is set.
   */
  metadata: Record<string, unknown> | null;
}

/** Lightweight reference for pipeline grouping (HUD header + pipeline-level abort). */
export interface ContentGenerationPipeline {
  id: string;
  label: string;
  createdAt: number;
  /**
   * If this pipeline is a retry, the ID of the original **pipeline** it was retried from.
   * Job-level retry lineage lives on {@link ContentGenerationJob.retryOf} only.
   */
  retryOf: string | null;
}

/** Per-stage outcome when a `full` topic pipeline exits with `ok: false` after partial persistence. */
export type TopicContentPipelinePartialCompletion = {
  theory: 'completed' | 'failed' | 'skipped';
  studyCards: 'completed' | 'failed' | 'skipped';
  miniGames: 'completed' | 'failed' | 'skipped';
};

/** Stages inside the topic unlock pipeline that can carry per-job retry lineage. */
export type TopicPipelineRetryStage = 'theory' | 'study-cards' | 'mini-games';

/**
 * Split retry lineage: pipeline vs per-stage job IDs.
 * `pipelineRetryOf` is stored on {@link ContentGenerationPipeline.retryOf}.
 * `jobRetryOfByStage[stage]` is passed as {@link ContentGenerationJob.retryOf} for that stage's LLM job.
 */
export type TopicPipelineRetryContext = {
  pipelineRetryOf: string | null;
  jobRetryOfByStage: Partial<Record<TopicPipelineRetryStage, string>>;
};
