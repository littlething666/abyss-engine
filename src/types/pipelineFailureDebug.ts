import type { GeneratedCardQualityReport, GeneratedCardValidationFailure } from './contentQuality';

/** Schema tag for serialized pipeline failure debug bundles. */
export const PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION = 'pipeline-debug-v1' as const;

/**
 * Allowlisted, JSON-serializable snapshot for failed LLM jobs.
 * Built only from explicit job fields and caller-supplied pipeline context.
 */
export interface PipelineFailureDebugBundle {
  schemaVersion: typeof PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION;
  pipelineId: string | null;
  jobId: string | null;
  jobKind: string | null;
  status: 'failed';
  subjectId: string | null;
  topicId: string | null;
  topicLabel: string | null;
  /** Aggregate stage from the topic pipeline (e.g. `full`) when applicable. */
  pipelineStage: string | null;
  /** Inner LLM stage (e.g. `study-cards`) or job-level stage label. */
  failedStage: string | null;
  retryOf: string | null;
  retryChainDepth: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  error: string | null;
  parseError: string | null;
  model: string | null;
  requestParams: Record<string, unknown> | null;
  llmRequestMessages: unknown;
  llmRawResponse: string;
  llmReasoningText: string | null;
  providerMetadata: unknown;
  validationFailures: GeneratedCardValidationFailure[] | null;
  qualityReport: GeneratedCardQualityReport | null;
  groundingSummary: unknown;
  groundingSources: unknown;
}

export interface PipelineFailureShellDebugInput {
  schemaVersion: typeof PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION;
  pipelineId: string | null;
  subjectId: string | null;
  topicId: string | null;
  topicLabel: string | null;
  pipelineStage: string | null;
  failedStage: string | null;
  retryOf: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  error: string;
}
