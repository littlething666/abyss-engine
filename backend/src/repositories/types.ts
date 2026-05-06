/**
 * Shared repository types for the backend Supabase adapter.
 *
 * Row shapes mirror the `0001_init.sql` schema exactly. Every function
 * that touches a table uses these types as its return / parameter contract.
 */

// ---------------------------------------------------------------------------
// devices
// ---------------------------------------------------------------------------
export interface DeviceRow {
  id: string;
  user_id: string | null;
  created_at: string;
  last_seen_at: string;
}

// ---------------------------------------------------------------------------
// runs
// ---------------------------------------------------------------------------
export type PipelineKind =
  | 'topic-content'
  | 'topic-expansion'
  | 'subject-graph'
  | 'crystal-trial';

export type RunStatus =
  | 'queued'
  | 'planning'
  | 'generating_stage'
  | 'parsing'
  | 'validating'
  | 'persisting'
  | 'ready'
  | 'applied_local'
  | 'failed_final'
  | 'cancelled';

export type CancelReason = 'user' | 'superseded';

export interface RunRow {
  id: string;
  device_id: string;
  kind: PipelineKind;
  status: RunStatus;
  input_hash: string;
  idempotency_key: string | null;
  parent_run_id: string | null;
  supersedes_key: string | null;
  cancel_requested_at: string | null;
  cancel_reason: CancelReason | null;
  subject_id: string | null;
  topic_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
  snapshot_json: Record<string, unknown>;
  next_event_seq: number;
}

// ---------------------------------------------------------------------------
// jobs
// ---------------------------------------------------------------------------
export interface JobRow {
  id: string;
  run_id: string;
  kind: string;
  stage: string;
  status: string;
  retry_of: string | null;
  input_hash: string;
  model: string;
  metadata_json: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------
/** @see src/features/generationContracts/runEvents.ts for the canonical event type union. */
export interface EventRow {
  id: string; // bigserial → string after JSON round-trip
  run_id: string;
  device_id: string;
  seq: number;
  ts: string;
  type: string;
  payload_json: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// artifacts
// ---------------------------------------------------------------------------
export interface ArtifactRow {
  id: string;
  device_id: string;
  created_by_run_id: string;
  kind: string;
  input_hash: string;
  storage_key: string;
  content_hash: string;
  schema_version: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// usage_counters
// ---------------------------------------------------------------------------
export interface UsageCounterRow {
  device_id: string;
  day: string; // YYYY-MM-DD UTC
  tokens_in: number;
  tokens_out: number;
  runs_started: number;
}

// ---------------------------------------------------------------------------
// stage_checkpoints
// ---------------------------------------------------------------------------
export type StageCheckpointStatus =
  | 'pending'
  | 'generating'
  | 'parsing'
  | 'validating'
  | 'persisting'
  | 'ready'
  | 'failed';

export interface StageCheckpointRow {
  run_id: string;
  stage: string;
  status: StageCheckpointStatus;
  artifact_id: string | null;
  job_id: string | null;
  input_hash: string;
  attempt: number;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
}

// ---------------------------------------------------------------------------
// OpenRouter usage (from the chat-completions response)
// ---------------------------------------------------------------------------
export interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}
