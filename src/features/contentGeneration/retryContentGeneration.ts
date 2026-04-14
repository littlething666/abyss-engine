/**
 * Retry bridge for failed/aborted content generation jobs and pipelines.
 *
 * Re-derives all LLM params (messages, model, chat repo) from current DB state
 * rather than replaying snapshots. This ensures retries use the latest data.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps job kinds that belong to a topic pipeline to their stage name. */
const JOB_KIND_TO_STAGE: Partial<Record<ContentGenerationJobKind, Exclude<TopicGenerationStage, 'full'>>> = {
  'topic-theory': 'theory',
  'topic-study-cards': 'study-cards',
  'topic-mini-games': 'mini-games',
};

/**
 * Parses the crystal level from an expansion job label.
 * Label format is deterministic: "Expansion L{n} — {title}".
 */
function parseExpansionLevel(label: string): number | null {
  const match = label.match(/^Expansion L(\d+)/);
  return match ? Number(match[1]) : null;
}

function isRetryable(status: ContentGenerationJob['status']): boolean {
  return status === 'failed' || status === 'aborted';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Whether the given standalone job can be retried. */
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
 * Retry a single failed/aborted standalone job.
 * Re-derives params from the current DB state and launches a fresh job
 * with a new ID (linked via `retryOf`).
 */
export async function retryFailedJob(job: ContentGenerationJob): Promise<void> {
  if (!canRetryJob(job)) return;

  const subjectId = job.subjectId!;
  const topicId = job.topicId;

  // ── Topic pipeline stage (standalone single-stage retry) ──────────
  const stage = JOB_KIND_TO_STAGE[job.kind];
  if (stage && topicId) {
    void runTopicGenerationPipeline({
      chat: getChatCompletionsRepositoryForSurface('topicContent'),
      deckRepository,
      writer: deckWriter,
      subjectId,
      topicId,
      enableThinking: false,
      forceRegenerate: true,
      stage,
      retryOf: job.id,
    });
    return;
  }

  // ── Expansion job ─────────────────────────────────────────────────
  if (job.kind === 'topic-expansion-cards' && topicId) {
    const nextLevel = parseExpansionLevel(job.label);
    if (!nextLevel) return;
    void runExpansionJob({
      chat: getChatCompletionsRepositoryForSurface('topicContent'),
      deckRepository,
      writer: deckWriter,
      subjectId,
      topicId,
      nextLevel,
      enableThinking: false,
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
      console.warn('[retryContentGeneration] Cannot retry subject-graph: checklist not found in manifest');
      return;
    }
    const chat = getChatCompletionsRepositoryForSurface('subjectGeneration');
    const model = resolveModelForSurface('subjectGeneration');
    const orchestrator = createSubjectGenerationOrchestrator();
    void orchestrator.execute(
      { subjectId, checklist },
      { chat, writer: deckWriter, model, enableThinking: false, retryOf: job.id },
    );
    return;
  }
}

/**
 * Retry a failed/aborted pipeline from the first failed stage onward.
 * Completed stages are skipped; the pipeline resumes with fresh LLM calls.
 */
export function retryFailedPipeline(pipelineId: string): void {
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

  // ── Topic content pipeline ────────────────────────────────────────
  const resumeStage = JOB_KIND_TO_STAGE[failedJob.kind];
  if (resumeStage && topicId) {
    void runTopicGenerationPipeline({
      chat: getChatCompletionsRepositoryForSurface('topicContent'),
      deckRepository,
      writer: deckWriter,
      subjectId,
      topicId,
      enableThinking: false,
      forceRegenerate: true,
      resumeFromStage: resumeStage,
      retryOf: pipelineId,
    });
    return;
  }

  // ── Subject generation pipeline (single-job pipeline) ─────────────
  if (failedJob.kind === 'subject-graph') {
    void retryFailedJob(failedJob);
  }
}
