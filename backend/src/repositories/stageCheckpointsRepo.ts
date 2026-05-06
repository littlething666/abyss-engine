/**
 * Stage checkpoints repository — per-run stage persistence.
 *
 * Each row records the status of a single stage within a run. For Topic
 * Content this gives per-stage resume; for Topic Expansion and Subject
 * Graph it provides a single row (expansion-cards / topics / edges) so the
 * `plan` step can gate on a persisted artifact_id without re-LLM on resume.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StageCheckpointRow, StageCheckpointStatus } from './types';

export interface IStageCheckpointsRepo {
  /** Return all checkpoint rows for a run (ordered by stage). */
  byRun(runId: string): Promise<StageCheckpointRow[]>;

  /** Insert or update a checkpoint row. */
  upsert(row: {
    runId: string;
    stage: string;
    status: StageCheckpointStatus;
    inputHash: string;
    attempt?: number;
    artifactId?: string | null;
    jobId?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<StageCheckpointRow>;

  /** Mark a stage as ready with its produced artifact. */
  markReady(runId: string, stage: string, artifactId: string): Promise<void>;

  /** Mark a stage as failed. */
  markFailed(runId: string, stage: string, errorCode: string, errorMessage: string): Promise<void>;
}

export function createStageCheckpointsRepo(
  db: SupabaseClient,
): IStageCheckpointsRepo {
  return {
    async byRun(runId: string) {
      const { data, error } = await db
        .from('stage_checkpoints')
        .select('*')
        .eq('run_id', runId)
        .order('stage', { ascending: true });

      if (error) throw error;
      return (data ?? []) as StageCheckpointRow[];
    },

    async upsert(row) {
      const { data, error } = await db
        .from('stage_checkpoints')
        .upsert({
          run_id: row.runId,
          stage: row.stage,
          status: row.status,
          input_hash: row.inputHash,
          attempt: row.attempt ?? 0,
          artifact_id: row.artifactId ?? null,
          job_id: row.jobId ?? null,
          started_at: row.startedAt ?? null,
          finished_at: row.finishedAt ?? null,
          error_code: row.errorCode ?? null,
          error_message: row.errorMessage ?? null,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as StageCheckpointRow;
    },

    async markReady(runId: string, stage: string, artifactId: string) {
      const now = new Date().toISOString();
      const { error } = await db
        .from('stage_checkpoints')
        .upsert({
          run_id: runId,
          stage,
          status: 'ready',
          artifact_id: artifactId,
          finished_at: now,
        });

      if (error) throw error;
    },

    async markFailed(
      runId: string,
      stage: string,
      errorCode: string,
      errorMessage: string,
    ) {
      const now = new Date().toISOString();
      const { error } = await db
        .from('stage_checkpoints')
        .upsert({
          run_id: runId,
          stage,
          status: 'failed',
          error_code: errorCode,
          error_message: errorMessage,
          finished_at: now,
        });

      if (error) throw error;
    },
  };
}
