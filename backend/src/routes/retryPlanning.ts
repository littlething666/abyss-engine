/**
 * Retry planning module — Phase 3.6 Step 3.
 *
 * Translates `{ stage, jobId }` from the retry body into a deterministic
 * per-pipeline run snapshot so the Worker workflow can resume from the
 * intended stage with correct lineage.
 *
 * ## Policy
 *
 * - The retry route MUST NOT ad-hoc mutate JSON. This module is the single
 *   seam that encodes per-pipeline retry semantics.
 * - `stage`-only retry: resume the workflow at the nominated stage.
 * - `jobId`-only retry: resume the specific failed job/checkpoint.
 * - `stage` + `jobId`: resume the specific job within a stage.
 * - Unsupported combinations fail loudly with a structured error code rather
 *   than silently discarding fields.
 */

import type { PipelineKind, RunRow } from '../repositories/types';

export interface RetryOptions {
  stage?: string;
  jobId?: string;
}

export interface RetryPlanResult {
  /** Modified snapshot to use for the retry run. */
  snapshot: Record<string, unknown>;
  /** Field names that were modified (for audit/logging). */
  modifiedFields: string[];
}

/**
 * Build a retry run snapshot from the parent run and retry options.
 *
 * The returned snapshot MUST be the exact input the workflow reads to
 * determine stage routing and checkpoint resumption.
 *
 * @throws {Error} with structured message when the combination is unsupported.
 */
export function buildRetryRunSnapshot(
  parentRun: RunRow,
  opts: RetryOptions,
): RetryPlanResult {
  const snapshot = { ...(parentRun.snapshot_json as Record<string, unknown>) };
  const modifiedFields: string[] = [];
  const { stage, jobId } = opts;
  const kind = parentRun.kind;

  // ── Stage handling ────────────────────────────────────────────
  if (stage) {
    switch (kind) {
      case 'topic-content': {
        // Topic Content workflow reads `resume_from_stage` from the snapshot.
        // Valid stage values: 'theory', 'study-cards', 'mini-games'.
        const VALID_TOPIC_CONTENT_STAGES = new Set([
          'theory', 'study-cards', 'mini-games',
        ]);
        if (!VALID_TOPIC_CONTENT_STAGES.has(stage)) {
          throw new Error(
            `topic-content retry: invalid stage "${stage}". Must be one of: ${[...VALID_TOPIC_CONTENT_STAGES].join(', ')}`,
          );
        }
        snapshot.resume_from_stage = stage;
        modifiedFields.push('resume_from_stage');
        break;
      }

      case 'subject-graph': {
        // Subject Graph has two stages: 'topics' (Stage A) and 'edges' (Stage B).
        // Stage B requires the Stage A artifact content hash to be set.
        const VALID_SG_STAGES = new Set(['topics', 'edges']);
        if (!VALID_SG_STAGES.has(stage)) {
          throw new Error(
            `subject-graph retry: invalid stage "${stage}". Must be 'topics' or 'edges'.`,
          );
        }
        snapshot.retry_stage = stage;

        // If retrying edges, the lattice_artifact_content_hash must be present.
        // It should already be in the snapshot from the original edges submission.
        if (stage === 'edges') {
          if (!snapshot.lattice_artifact_content_hash) {
            throw new Error(
              'subject-graph edges retry: snapshot missing lattice_artifact_content_hash. ' +
              'The parent run must have completed Stage A before retrying Stage B.',
            );
          }
        }
        modifiedFields.push('retry_stage');
        break;
      }

      case 'crystal-trial': {
        // Crystal Trial is a single-stage pipeline. `stage` is not meaningful
        // for retry; the retry re-generates the entire trial.
        // We still accept it to preserve backwards compat but log.
        snapshot.retry_stage = stage;
        modifiedFields.push('retry_stage');
        break;
      }

      case 'topic-expansion': {
        // Topic Expansion is also single-stage. Accept but log.
        snapshot.retry_stage = stage;
        modifiedFields.push('retry_stage');
        break;
      }
    }
  }

  // ── jobId handling ────────────────────────────────────────────
  if (jobId) {
    // Persist jobId in the snapshot so workflows can recover the specific
    // checkpoint/job lineage.
    snapshot.retry_of_job_id = jobId;
    modifiedFields.push('retry_of_job_id');

    // Also set on the retry run's parent_job_id (added later by the route
    // into the runs row — this field here is for the snapshot JSON).
  }

  return { snapshot, modifiedFields };
}
