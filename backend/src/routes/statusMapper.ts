/**
 * Status naming mapper — Phase 3.6 Step 7.
 *
 * Maps between backend DB row statuses (underscore-separated) and transport
 * statuses (hyphen-separated). Every SSE event, route response, and client
 * snapshot must use the transport form; the DB stores the underscore form.
 *
 * ## Lockstep policy
 *
 * Every production code path that consumes or emits run statuses MUST go
 * through this mapper. Tests lock every status value so underscore/hyphen
 * drift cannot leak into the client.
 */

import type { RunStatus as DbRunStatus } from '../repositories/types';

/**
 * Transport run status — canonical hyphen-separated form exposed to the
 * browser via SSE events, JSON responses, and `RunSnapshot.status`.
 */
export type TransportRunStatus =
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

/**
 * Every DB status and its exact transport mapping.
 * Kept as a const object so tests can iterate it.
 */
export const DB_TO_TRANSPORT_STATUS: Record<DbRunStatus, TransportRunStatus> = {
  queued: 'queued',
  planning: 'planning',
  generating_stage: 'generating-stage',
  parsing: 'parsing',
  validating: 'validating',
  persisting: 'persisting',
  ready: 'ready',
  applied_local: 'applied-local',
  failed_final: 'failed-final',
  cancelled: 'cancelled',
};

/**
 * Map a DB status to its transport form.
 * Unknown statuses return as-is (defensive; should never happen).
 */
export function dbStatusToTransport(status: string): TransportRunStatus {
  const mapped = DB_TO_TRANSPORT_STATUS[status as DbRunStatus];
  return mapped ?? (status as TransportRunStatus);
}

/**
 * Map a transport status to its DB form.
 * Unknown statuses return as-is (defensive).
 */
export function transportStatusToDb(status: string): DbRunStatus {
  for (const [db, transport] of Object.entries(DB_TO_TRANSPORT_STATUS)) {
    if (transport === status) return db as DbRunStatus;
  }
  return status as DbRunStatus;
}

/**
 * All transport statuses that are considered "active" (run not yet terminal).
 * Used by `GET /v1/runs?status=active` — terminal `ready` is excluded per
 * Phase 3.6 Step 2 so rehydration only picks up truly in-flight runs.
 */
export const ACTIVE_TRANSPORT_STATUSES: readonly TransportRunStatus[] = [
  'queued',
  'planning',
  'generating-stage',
  'parsing',
  'validating',
  'persisting',
];

/**
 * All terminal transport statuses.
 */
export const TERMINAL_TRANSPORT_STATUSES: readonly TransportRunStatus[] = [
  'ready',
  'applied-local',
  'failed-final',
  'cancelled',
];
