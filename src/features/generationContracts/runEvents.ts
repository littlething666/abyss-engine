/**
 * `RunEvent` is the single transport contract between any generation
 * orchestrator (durable Worker, local synthetic adapter) and the client.
 * Every UI / mentor / store reaction subscribes to this event stream — never
 * to internal pipeline state.
 *
 * Event lifecycle is monotonically ordered by `seq` per `runId`. Resumption
 * uses `Last-Event-ID` and replays only `seq > lastSeq`.
 */

import type { GenerationFailureCode } from './failureCodes';

export type RunStatus =
  | 'queued'
  | 'planning'
  | 'generating-stage'
  | 'parsing'
  | 'validating'
  | 'persisting'
  | 'ready'
  | 'applied-local'
  | 'failed-final'
  | 'cancelled';

export type ArtifactReadyEventBody = {
  /** Stable artifact id (uuid v4). */
  artifactId: string;
  /** Subject/topic context (when applicable). */
  subjectId?: string;
  topicId?: string;
  /** Artifact kind discriminator (matches `ArtifactKind` in `artifacts/types`). */
  kind: string;
  /** sha256 tag of the canonicalized artifact payload (`cnt_<hex>`). */
  contentHash: string;
  /** Schema version for the artifact payload — used to gate `ArtifactApplier`s. */
  schemaVersion: number;
  /** Canonical input hash (`inp_<hex>`) the artifact was produced from. */
  inputHash: string;
};

export type StageProgressEventBody = {
  stage: string;
  /** Optional 0..1 progress hint; orchestrator may omit if unknown. */
  progress?: number;
};

export type RunEventBase = {
  /** Run-scoped identifier (uuid v4). */
  runId: string;
  /** Monotonic per-run sequence number. */
  seq: number;
  /** ISO-8601 emission timestamp. */
  ts: string;
};

export type RunEvent =
  | (RunEventBase & { type: 'run.queued' })
  | (RunEventBase & { type: 'run.status'; status: RunStatus })
  | (RunEventBase & { type: 'stage.progress'; body: StageProgressEventBody })
  | (RunEventBase & { type: 'artifact.ready'; body: ArtifactReadyEventBody })
  | (RunEventBase & { type: 'run.completed' })
  | (RunEventBase & { type: 'run.failed'; code: GenerationFailureCode; message: string })
  | (RunEventBase & { type: 'run.cancel-acknowledged'; reason: 'user' | 'superseded' })
  | (RunEventBase & { type: 'run.cancelled'; reason: 'user' | 'superseded' });

/** Discriminator helper for switch exhaustiveness checks. */
export function runEventType(e: RunEvent): RunEvent['type'] {
  return e.type;
}
