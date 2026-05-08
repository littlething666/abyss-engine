/** Stage checkpoints repository — per-run stage persistence in D1. */

import type { StageCheckpointRow, StageCheckpointStatus } from './types';
import { nowIso } from './d1';

export interface IStageCheckpointsRepo {
  byRun(runId: string): Promise<StageCheckpointRow[]>;
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
  markReady(runId: string, stage: string, artifactId: string): Promise<void>;
  markFailed(runId: string, stage: string, errorCode: string, errorMessage: string): Promise<void>;
}

function changes(result: unknown): number {
  return (result as { meta?: { changes?: number } }).meta?.changes ?? 0;
}

export function createStageCheckpointsRepo(db: D1Database): IStageCheckpointsRepo {
  return {
    async byRun(runId) {
      const { results } = await db.prepare(`
        select * from stage_checkpoints where run_id = ? order by stage asc
      `).bind(runId).all<StageCheckpointRow>();
      return results ?? [];
    },

    async upsert(row) {
      const result = await db.prepare(`
        insert into stage_checkpoints (
          run_id, stage, status, artifact_id, job_id, input_hash, attempt,
          started_at, finished_at, error_code, error_message
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(run_id, stage) do update set
          status = excluded.status,
          artifact_id = excluded.artifact_id,
          job_id = excluded.job_id,
          input_hash = excluded.input_hash,
          attempt = excluded.attempt,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          error_code = excluded.error_code,
          error_message = excluded.error_message
        returning *
      `).bind(
        row.runId,
        row.stage,
        row.status,
        row.artifactId ?? null,
        row.jobId ?? null,
        row.inputHash,
        row.attempt ?? 0,
        row.startedAt ?? null,
        row.finishedAt ?? null,
        row.errorCode ?? null,
        row.errorMessage ?? null,
      ).first<StageCheckpointRow>();
      if (!result) throw new Error('D1 stageCheckpoints.upsert: failed to return checkpoint row');
      return result;
    },

    async markReady(runId, stage, artifactId) {
      const result = await db.prepare(`
        update stage_checkpoints
        set status = 'ready', artifact_id = ?, finished_at = ?
        where run_id = ? and stage = ?
      `).bind(artifactId, nowIso(), runId, stage).run();
      if (changes(result) === 0) {
        throw new Error(`D1 stageCheckpoints.markReady: missing checkpoint ${runId}/${stage}`);
      }
    },

    async markFailed(runId, stage, errorCode, errorMessage) {
      const result = await db.prepare(`
        update stage_checkpoints
        set status = 'failed', error_code = ?, error_message = ?, finished_at = ?
        where run_id = ? and stage = ?
      `).bind(errorCode, errorMessage, nowIso(), runId, stage).run();
      if (changes(result) === 0) {
        throw new Error(`D1 stageCheckpoints.markFailed: missing checkpoint ${runId}/${stage}`);
      }
    },
  };
}
