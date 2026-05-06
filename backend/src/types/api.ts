/**
 * API-level types shared between route handlers.
 *
 * Phase 2: expanded to cover all four pipeline kinds.
 * PR-D will replace lightweight assertions with actual @contracts Zod schemas.
 */

import type { PipelineKind } from '../repositories/types';

export interface RunInputSnapshot {
  pipeline_kind: string;
  schema_version: number;
  subject_id: string;
  topic_id?: string;
  [key: string]: unknown;
}

export interface SubmitRunBody {
  kind: PipelineKind;
  snapshot: RunInputSnapshot;
}
