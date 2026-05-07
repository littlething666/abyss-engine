/**
 * API-level types shared between route handlers.
 *
 * Phase 4: run submission accepts backend-expanded intents, not client-built
 * snapshots.
 */

import type { PipelineKind } from '../repositories/types';

export interface SubmitRunBody {
  kind: PipelineKind;
  intent: Record<string, unknown>;
}
