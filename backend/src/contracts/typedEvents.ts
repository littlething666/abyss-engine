/**
 * Typed RunEvent persistence builders — Phase 3.6 Step 6.
 *
 * Ensures every event row persisted to the `events` table carries the
 * canonical payload shape for its type. Workflows and routes use these
 * builders instead of hand-writing event names and loose payloads.
 *
 * ## Policy
 *
 * - Every event type MUST have a builder function.
 * - Every builder enforces required payload fields at the type level.
 * - Tests reject missing `artifact.ready.kind`, `inputHash`, `contentHash`,
 *   or `schemaVersion`.
 * - Backend status payloads carry transport (hyphen-separated) statuses.
 */

import { dbStatusToTransport, type TransportRunStatus } from './statusMapper';

// ---------------------------------------------------------------------------
// Event payload types (typed subsets of the full contract)
// ---------------------------------------------------------------------------

export interface RunQueuedPayload {
  retry_of?: string;
}

export interface RunStatusPayload {
  status: TransportRunStatus;
}

export interface StageProgressPayload {
  stage: string;
  progress?: number;
  message?: string;
}

export interface ArtifactReadyPayload {
  artifactId: string;
  kind: string;
  contentHash: string;
  inputHash: string;
  schemaVersion: number;
  fromCache?: boolean;
}

export interface RunCompletedPayload {
  // reserved for future metadata
}

export interface RunFailedPayload {
  code: string;
  message: string;
}

export interface RunCancelledPayload {
  boundary: string;
  reason: string;
}

export interface RunCancelAcknowledgedPayload {
  reason: string;
}

// ---------------------------------------------------------------------------
// Typed event type union
// ---------------------------------------------------------------------------

export type TypedEventType =
  | 'run.queued'
  | 'run.status'
  | 'stage.progress'
  | 'artifact.ready'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.cancel-acknowledged';

export type TypedEventPayload =
  | RunQueuedPayload
  | RunStatusPayload
  | StageProgressPayload
  | ArtifactReadyPayload
  | RunCompletedPayload
  | RunFailedPayload
  | RunCancelledPayload
  | RunCancelAcknowledgedPayload;

// ---------------------------------------------------------------------------
// Type → payload mapping for compile-time safety
// ---------------------------------------------------------------------------

export interface TypedEventPayloadMap {
  'run.queued': RunQueuedPayload;
  'run.status': RunStatusPayload;
  'stage.progress': StageProgressPayload;
  'artifact.ready': ArtifactReadyPayload;
  'run.completed': RunCompletedPayload;
  'run.failed': RunFailedPayload;
  'run.cancelled': RunCancelledPayload;
  'run.cancel-acknowledged': RunCancelAcknowledgedPayload;
}

// ---------------------------------------------------------------------------
// Builders — one per event type
// ---------------------------------------------------------------------------

export function buildTypedEvent<T extends TypedEventType>(
  type: T,
  payload: TypedEventPayloadMap[T],
): { type: T; payload: Record<string, unknown> } {
  return { type, payload: payload as unknown as Record<string, unknown> };
}

export function buildRunQueuedEvent(payload: RunQueuedPayload = {}) {
  return buildTypedEvent('run.queued', payload);
}

export function buildRunStatusEvent(status: string) {
  return buildTypedEvent('run.status', {
    status: dbStatusToTransport(status),
  });
}

export function buildStageProgressEvent(stage: string, progress?: number, message?: string) {
  return buildTypedEvent('stage.progress', { stage, progress, message });
}

export function buildArtifactReadyEvent(payload: ArtifactReadyPayload) {
  // Runtime assertion: ensure required fields are present.
  if (!payload.artifactId || !payload.kind || !payload.contentHash || !payload.inputHash || payload.schemaVersion === undefined) {
    throw new Error(
      `artifact.ready event missing required fields: ${JSON.stringify({ hasId: !!payload.artifactId, hasKind: !!payload.kind, hasContentHash: !!payload.contentHash, hasInputHash: !!payload.inputHash, hasSchemaVersion: payload.schemaVersion !== undefined })}`,
    );
  }
  return buildTypedEvent('artifact.ready', payload);
}

export function buildRunCompletedEvent() {
  return buildTypedEvent('run.completed', {});
}

export function buildRunFailedEvent(code: string, message: string) {
  return buildTypedEvent('run.failed', { code, message });
}

export function buildRunCancelledEvent(boundary: string, reason: string) {
  return buildTypedEvent('run.cancelled', { boundary, reason });
}

export function buildRunCancelAcknowledgedEvent(reason: string) {
  return buildTypedEvent('run.cancel-acknowledged', { reason });
}
