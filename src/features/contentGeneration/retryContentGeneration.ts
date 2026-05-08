/**
 * Retry bridge for failed/aborted content generation jobs and pipelines.
 */

import type {
  ContentGenerationJob,
  ContentGenerationJobKind,
  ContentGenerationPipeline,
} from '@/types/contentGeneration';
import type { TopicGenerationStage } from './pipelines/topicGenerationStage';
import { useContentGenerationStore } from './contentGenerationStore';
import { failureKeyForRetryRoutingInstance } from './failureKeys';
import { appEventBus } from '@/infrastructure/eventBus';
import { getGenerationClient } from './generationClient';

const JOB_KIND_TO_STAGE: Partial<Record<ContentGenerationJobKind, Exclude<TopicGenerationStage, 'full'>>> = {
  'topic-theory': 'theory',
  'topic-study-cards': 'study-cards',
  'topic-mini-games': 'mini-games',
  'topic-mini-game-category-sort': 'mini-games',
  'topic-mini-game-sequence-build': 'mini-games',
  'topic-mini-game-match-pairs': 'mini-games',
};

function durableRunIdForJob(job: ContentGenerationJob): string {
  const runId = job.metadata?.runId;
  if (typeof runId === 'string' && runId.trim()) return runId;
  return job.pipelineId ?? job.id;
}

function isRetryable(status: ContentGenerationJob['status']): boolean {
  return status === 'failed' || status === 'aborted';
}

function emitRetryFailed(
  job: ContentGenerationJob,
  jobLabel: string,
  errorMessage: string,
): void {
  if (!job.subjectId) return;
  const failureInstanceId = crypto.randomUUID();
  const failureKey = failureKeyForRetryRoutingInstance(failureInstanceId);
  useContentGenerationStore.getState().registerSessionRetryRoutingFailure({
    failureKey,
    failureInstanceId,
    originalJobId: job.id,
    subjectId: job.subjectId,
    ...(job.topicId ? { topicId: job.topicId } : {}),
    jobLabel,
    errorMessage,
    createdAt: Date.now(),
  });
  appEventBus.emit('content-generation:retry-failed', {
    subjectId: job.subjectId,
    ...(job.topicId ? { topicId: job.topicId } : {}),
    jobLabel,
    errorMessage,
    jobId: job.id,
    failureInstanceId,
    failureKey,
  });
}

function logRetryRoutingCollapse(jobLabel: string, errorMessage: string): void {
  console.error(`[retryContentGeneration] ${jobLabel}: ${errorMessage}`);
}

export function canRetryJob(job: ContentGenerationJob): boolean {
  return isRetryable(job.status) && job.subjectId !== null;
}

export function canRetryPipeline(
  pipeline: ContentGenerationPipeline,
  allJobs: ContentGenerationJob[],
): boolean {
  return allJobs.some(
    (j) => j.pipelineId === pipeline.id && isRetryable(j.status),
  );
}

export function canRetrySubjectGraphPipeline(
  pipeline: ContentGenerationPipeline,
  allJobs: ContentGenerationJob[],
): boolean {
  return allJobs.some(
    (j) =>
      j.pipelineId === pipeline.id &&
      isRetryable(j.status) &&
      (j.kind === 'subject-graph-topics' || j.kind === 'subject-graph-edges'),
  );
}

export async function retryFailedJob(job: ContentGenerationJob): Promise<void> {
  if (!canRetryJob(job)) return;

  try {
    const stage = JOB_KIND_TO_STAGE[job.kind];
    await getGenerationClient().retry(durableRunIdForJob(job), {
      jobId: job.id,
      ...(stage ? { stage } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[retryContentGeneration] retryFailedJob error:', msg);
    emitRetryFailed(job, job.label, msg);
  }
}

export async function retryFailedPipeline(pipelineId: string): Promise<void> {
  const store = useContentGenerationStore.getState();
  const pipelineJobs = Object.values(store.jobs)
    .filter((j) => j.pipelineId === pipelineId)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (pipelineJobs.length === 0) return;

  const failedJob = pipelineJobs.find((j) => isRetryable(j.status));
  if (!failedJob) return;

  if (!failedJob.subjectId) return;

  const pipelineLabel = store.pipelines[pipelineId]?.label ?? `pipeline ${pipelineId}`;

  try {
    const resumeStage = JOB_KIND_TO_STAGE[failedJob.kind];
    await getGenerationClient().retry(pipelineId, {
      jobId: failedJob.id,
      ...(resumeStage ? { stage: resumeStage } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[retryContentGeneration] retryFailedPipeline error:', msg);
    emitRetryFailed(failedJob, pipelineLabel, msg);
  }
}
