/**
 * API-level types shared between route handlers.
 *
 * These are stubs for the Phase 1 @contracts types.  PR-D replaces the
 * lightweight assertions with the actual `@contracts` Zod schemas.
 */

export interface RunInputSnapshot {
  pipeline_kind: string;
  schema_version: number;
  subject_id: string;
  topic_id: string;
  [key: string]: unknown;
}
