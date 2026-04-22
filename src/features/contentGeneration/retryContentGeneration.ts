/**
 * Retry bridge for failed/aborted content generation jobs and pipelines.
 *
 * Re-derives all LLM params (messages, model, chat repo) from current DB state
 * rather than replaying snapshots. This ensures retries use the latest data.
 * `enableReasoning` is replayed from the original job's metadata.
 */

import type { ContentGenerationJob, ContentGenerationJobKind, ContentGenerationPipeline } from '@/types/contentGeneration';
import type { StudyChecklist } from '@/types/studyChecklist';
import type { TopicGenerationStage } from './pipelines/topicGenerationStage';
import { useContentGenerationStore } from './contentGenerationStore';
import { deckRepository, deckWriter } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';
import { runTopicGenerationPipeline } from './pipelines/runTopicGenerationPipeline';
import { runExpansionJob } from './jobs/runExpansionJob';
import {
  createSubjectGenerationOrchestrator,
  resolveSubjectGenerationStageBindings,
} from '@/features/subjectGeneration';
import { resolveSubjectGraphRetryContextFromJob } from './subjectGenerationPipelineContext';
import { generateTrialQuestions } from '@/features/crystalTrial/generateTrialQuestions';
import { toast } from '@/infrastructure/toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps job kinds that belong to a topic pipeline to their stage name. */
const JOB_KIND_TO_STAGE: Partial<Record<ContentGenerationJobKind, Exclude<TopicGenerationStage, 'full'>>> = {
  'topic-theory': 'theory',
  'topic-study-cards': 'study-cards',
  'topic-mini-games': 'mini-games',
};

function getEnableReasoningFromJobMetadata(job: ContentGenerationJob): boolean {
  const m = job.metadata;
  if (m && typeof m.enableReasoning === 'boolean') return m.enableReasoning;
  return false;
}

function getNextLevel(job: ContentGenerationJob): number | null {
  const fromMeta = job.metadata?.nextLevel;
  if (typeof fromMeta === 'number') return fromMeta;
  // Fallback: parse from label for backwards-compat with jobs created before metadata
  const match = job.label.match(/^Expansion L(\d+)/);
  return match ? Number(match[1]) : null;
}

function getCrystalTrialCurrentLevel(job: ContentGenerationJob): number | null {
  const fromMeta = job.metadata?.currentLevel;
  if (typeof fromMeta === 'number' && Number.isInteger(fromMeta)) {
    return fromMeta;
  }

  const match = job.label.match(/Crystal Trial L(\d+)/);
  if (!match) return null;

  const level = Number(match[1]) - 1;
  return Number.isInteger(level) ? level : null;
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

/** True when a failed pipeline includes a subject-graph job (manual pipeline retry). */
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

/**
 * Retry a single failed/aborted job.
 * Re-derives params from the current DB state and launches a fresh job
 * with a new ID (linked via `retryOf`).
 */
export async function retryFailedJob(job: ContentGenerationJob): Promise<void> {
  if (!canRetryJob(job)) return;

  const subjectId = job.subjectId!;
  const topicId = job.topicId;
  const enableReasoning = getEnableReasoningFromJobMetadata(job);

  try {
    // ── Topic pipeline stage ──────────────────────────────────────────
    const stage = JOB_KIND_TO_STAGE[job.kind];
    if (stage && topicId) {
      toast(`Retrying ${job.label}…`);
      await runTopicGenerationPipeline({
        chat: getChatCompletionsRepositoryForSurface('topicContent'),
        deckRepository,
        writer: deckWriter,
        subjectId,
        topicId,
        enableReasoning,
        forceRegenerate: true,
        stage,
        retryOf: job.id,
      });
      return;
    }

    // ── Crystal Trial ───────────────────────────────────────────────
    if (job.kind === 'crystal-trial' && topicId) {
      const trialCurrentLevel = getCrystalTrialCurrentLevel(job);
      if (trialCurrentLevel === null) {
        toast.error(`Cannot retry crystal-trial: unable to determine current level from job "${job.label}"`);
        return;
      }

      toast(`Retrying ${job.label}…`);
      await generateTrialQuestions({
        chat: getChatCompletionsRepositoryForSurface('crystalTrial'),
        deckRepository,
        subjectId,
        topicId,
        currentLevel: trialCurrentLevel,
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
      toast(`Retrying ${job.label}…`);
      await runExpansionJob({
        chat: getChatCompletionsRepositoryForSurface('topicContent'),
        deckRepository,
        writer: deckWriter,
        subjectId,
        topicId,
        nextLevel,
        enableReasoning,
        retryOf: job.id,
      });
      return;
    }

    // ── Subject graph (two-stage: always re-run full pipeline) ────────
    if (job.kind === 'subject-graph-topics' || job.kind === 'subject-graph-edges') {
      const ctx = await resolveSubjectGraphRetryContextFromJob(job);
      if (!ctx) {
        toast.error(
          'Cannot retry subject generation: checklist not recoverable from retry metadata, manifest, or label',
        );
        return;
      }
      const stageBindings = resolveSubjectGenerationStageBindings();
      const orchestrator = createSubjectGenerationOrchestrator();
      void orchestrator.execute(
        { subjectId: ctx.subjectId, checklist: ctx.checklist },
        {
          stageBindings,
          writer: deckWriter,
          retryOf: job.id,
        },
      );
      toast(`Retrying ${job.label}…`);
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

  const enableReasoning = getEnableReasoningFromJobMetadata(failedJob);

  try {
    // ── Topic content pipeline ────────────────────────────────────────
    const resumeStage = JOB_KIND_TO_STAGE[failedJob.kind];
    if (resumeStage && topicId) {
      toast(`Retrying pipeline from ${resumeStage}…`);
      await runTopicGenerationPipeline({
        chat: getChatCompletionsRepositoryForSurface('topicContent'),
        deckRepository,
        writer: deckWriter,
        subjectId,
        topicId,
        enableReasoning,
        forceRegenerate: true,
        resumeFromStage: resumeStage,
        retryOf: pipelineId,
      });
      return;
    }

    // ── Subject generation pipeline (topics + edges jobs) ─────────────
    if (failedJob.kind === 'subject-graph-topics' || failedJob.kind === 'subject-graph-edges') {
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
