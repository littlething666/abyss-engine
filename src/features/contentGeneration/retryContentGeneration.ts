/**
 * Retry bridge for failed/aborted content generation jobs and pipelines.
 *
 * Re-derives all LLM params (messages, model, chat repo) from current DB state
 * rather than replaying snapshots. This ensures retries use the latest data.
 * enableThinking is replayed from the original job's metadata.
 */

import type { ContentGenerationJob, ContentGenerationJobKind, ContentGenerationPipeline } from '@/types/contentGeneration';
import type { TopicGenerationStage } from './pipelines/topicGenerationStage';
import { useContentGenerationStore } from './contentGenerationStore';
import { deckRepository, deckWriter } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';
import { resolveModelForSurface } from '@/infrastructure/llmInferenceSurfaceProviders';
import { runTopicGenerationPipeline } from './pipelines/runTopicGenerationPipeline';
import { runExpansionJob } from './jobs/runExpansionJob';
import { createSubjectGenerationOrchestrator } from '@/features/subjectGeneration';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps job kinds that belong to a topic pipeline to their stage name. */
const JOB_KIND_TO_STAGE: Partial<Record<ContentGenerationJobKind, Exclude<TopicGenerationStage, 'full'>>> = {
  'topic-theory': 'theory',
  'topic-study-cards': 'study-cards',
  'topic-mini-games': 'mini-games',
};

function getEnableThinking(job: ContentGenerationJob): boolean {
  return (job.metadata?.enableThinking as boolean) ?? false;
}

function getNextLevel(job: ContentGenerationJob): number | null {
  const fromMeta = job.metadata?.nextLevel;
  if (typeof fromMeta === 'number') return fromMeta;
  // Fallback: parse from label for backwards-compat with jobs created before metadata
  const match = job.label.match(/^Expansion L(\d+)/);
  return match ? Number(match[1]) : null;
}

function isRetryable(status: ContentGenerationJob['status']): boolean {
  return status === 'failed' || status === 'aborted';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Whether the given job can be retried. */
export function canRetryJob(job: ContentGenerationJob): boolean {
  return isRetryable(job.status) && job.subjectId !== null;
}

/** Whether any job in the pipeline failed/aborted and is eligible for retry. */
export function canRetryPipeline(
  pipeline: ContentGenerationPipeline,
  allJobs: ContentGenerationJob[],
): boolean {
  return allJobs.some(
    (j) => j.pipelineId === pipeline.id && isRetryable(j.status),
  );
}

/**
 * Retry a single failed/aborted job.
 * Re-derives params from the current DB state and launches a fresh job
 * with a new ID (linked via `retryOf`).
 */
export async function retryFailedJob(job: ContentGenerationJob): Promise<void> {
  if (!canRetryJob(job)) return;

  const subjectId = job.subjectId!;
  const topicId = job.topicId;
  const enableThinking = getEnableThinking(job);

  try {
    // ── Topic pipeline stage ──────────────────────────────────────────
    const stage = JOB_KIND_TO_STAGE[job.kind];
    if (stage && topicId) {
      toast(`Retrying ${job.label}\u2026`);
      await runTopicGenerationPipeline({
        chat: getChatCompletionsRepositoryForSurface('topicContent'),
        deckRepository,
        writer: deckWriter,
        subjectId,
        topicId,
        enableThinking,
        forceRegenerate: true,
        stage,
        retryOf: job.id,
      });
      return;
    }

    // ── Expansion job ─────────────────────────────────────────────────
    if (job.kind === 'topic-expansion-cards' && topicId) {
      const nextLevel = getNextLevel(job);
      if (!nextLevel) {
        toast.error(`Cannot retry expansion: unable to determine crystal level from job "${job.label}"`);
        return;
      }
      toast(`Retrying ${job.label}\u2026`);
      await runExpansionJob({
        chat: getChatCompletionsRepositoryForSurface('topicContent'),
        deckRepository,
        writer: deckWriter,
        subjectId,
        topicId,
        nextLevel,
        enableThinking,
        retryOf: job.id,
      });
      return;
    }

    // ── Subject graph ─────────────────────────────────────────────────
    if (job.kind === 'subject-graph') {
      const manifest = await deckRepository.getManifest();
      const subject = manifest.subjects.find((s) => s.id === subjectId);
      const checklist = subject?.metadata?.checklist;
      if (!checklist) {
        toast.error('Cannot retry subject generation: checklist not found in manifest');
        return;
      }
      const chat = getChatCompletionsRepositoryForSurface('subjectGeneration');
      const model = resolveModelForSurface('subjectGeneration');
      const orchestrator = createSubjectGenerationOrchestrator();
      void orchestrator.execute(
        { subjectId, checklist },
        { chat, writer: deckWriter, model, enableThinking, retryOf: job.id },
      );
      toast(`Retrying ${job.label}\u2026`);
      return;
    }

    toast.error(`Cannot retry job: unsupported kind "${job.kind}"`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[retryContentGeneration] retryFailedJob error:', msg);
    toast.error(`Retry failed: ${msg}`);
  }
}

/**
 * Retry a failed/aborted pipeline from the first failed stage onward.
 * Completed stages are skipped; the pipeline resumes with fresh LLM calls.
 */
export async function retryFailedPipeline(pipelineId: string): Promise<void> {
  const store = useContentGenerationStore.getState();
  const pipelineJobs = Object.values(store.jobs)
    .filter((j) => j.pipelineId === pipelineId)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (pipelineJobs.length === 0) return;

  // Find the first failed/aborted job to determine the resume point.
  const failedJob = pipelineJobs.find((j) => isRetryable(j.status));
  if (!failedJob) return;

  const subjectId = failedJob.subjectId;
  const topicId = failedJob.topicId;
  if (!subjectId) return;

  const enableThinking = getEnableThinking(failedJob);

  try {
    // ── Topic content pipeline ────────────────────────────────────────
    const resumeStage = JOB_KIND_TO_STAGE[failedJob.kind];
    if (resumeStage && topicId) {
      toast(`Retrying pipeline from ${resumeStage}\u2026`);
      await runTopicGenerationPipeline({
        chat: getChatCompletionsRepositoryForSurface('topicContent'),
        deckRepository,
        writer: deckWriter,
        subjectId,
        topicId,
        enableThinking,
        forceRegenerate: true,
        resumeFromStage: resumeStage,
        retryOf: pipelineId,
      });
      return;
    }

    // ── Subject generation pipeline (single-job pipeline) ─────────────
    if (failedJob.kind === 'subject-graph') {
      await retryFailedJob(failedJob);
      return;
    }

    toast.error('Cannot retry pipeline: unknown job kind');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[retryContentGeneration] retryFailedPipeline error:', msg);
    toast.error(`Pipeline retry failed: ${msg}`);
  }
}
