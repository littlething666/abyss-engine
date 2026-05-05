import Dexie from 'dexie';

import type { ContentGenerationJob, ContentGenerationPipeline } from '@/types/contentGeneration';

/**
 * IndexedDB read-cache for terminal generation job logs.
 *
 * ## Status: demoted to UI read-cache (Phase 0.5 → Phase 1)
 *
 * This store is NO LONGER authoritative for generation run state.
 * Durable run state lives in the Worker + Supabase Postgres and is
 * hydrated via `useContentGenerationHydration`. This store persists
 * terminal job logs for UI display (HUD, history) only. The 15-job
 * hygiene cap stays for storage discipline.
 *
 * Per Plan v3 and Phase 0.5: `Dexie 'abyss-content-generation-logs'`
 * is a UI read-cache. Generation orchestration and artifact
 * application flow through `IGenerationRunRepository` adapters.
 */

class ContentGenerationLogDb extends Dexie {
  jobs!: Dexie.Table<ContentGenerationJob, string>;
  pipelines!: Dexie.Table<ContentGenerationPipeline, string>;

  constructor() {
    super('abyss-content-generation-logs');
    this.version(1).stores({
      jobs: 'id, pipelineId, kind, status, finishedAt',
      pipelines: 'id',
    });
  }
}

const db = new ContentGenerationLogDb();

const TERMINAL_STATUSES: ContentGenerationJob['status'][] = ['completed', 'failed', 'aborted'];

export async function persistTerminalJob(job: ContentGenerationJob): Promise<void> {
  await db.jobs.put(job);

  const count = await db.jobs.where('status').anyOf(TERMINAL_STATUSES).count();
  if (count > 15) {
    const sorted = await db.jobs.where('status').anyOf(TERMINAL_STATUSES).sortBy('finishedAt');
    const excess = sorted.slice(0, count - 15);
    await db.jobs.bulkDelete(excess.map((j) => j.id));
  }
}

export async function persistPipeline(pipeline: ContentGenerationPipeline): Promise<void> {
  await db.pipelines.put(pipeline);
}

export async function loadPersistedLogs(): Promise<{
  jobs: ContentGenerationJob[];
  pipelines: ContentGenerationPipeline[];
}> {
  const jobs = await db.jobs.toArray();
  const pipelineIds = [...new Set(jobs.map((j) => j.pipelineId).filter(Boolean) as string[])];
  const pipelines =
    pipelineIds.length === 0
      ? []
      : await db.pipelines.where('id').anyOf(pipelineIds).toArray();
  return { jobs, pipelines };
}

export async function clearPersistedLogs(): Promise<void> {
  await db.jobs.clear();
  await db.pipelines.clear();
}
