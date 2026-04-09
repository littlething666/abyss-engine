import Dexie from 'dexie';

import type { ContentGenerationJob, ContentGenerationPipeline } from '@/types/contentGeneration';

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
