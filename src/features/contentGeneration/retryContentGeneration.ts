/**
 * Retry bridge for failed/aborted content generation jobs and pipelines.
 */

import type {
  ContentGenerationJob,
  ContentGenerationJobKind,
  ContentGenerationPipeline,
} from '@/types/contentGeneration';
import type { MiniGameType } from '@/types/core';
import type { StudyChecklist } from '@/types/studyChecklist';
import type { TopicGenerationStage } from './pipelines/topicGenerationStage';
import { useContentGenerationStore } from './contentGenerationStore';
import { failureKeyForRetryRoutingInstance } from './failureKeys';
import { appEventBus } from '@/infrastructure/eventBus';
import { deckRepository } from '@/infrastructure/di';
import { resolveModelForSurface } from '@/infrastructure/llmInferenceSurfaceProviders';
import { getGenerationClient } from './generationClient';
import {
  prepareCrystalTrialRunInput,
  prepareSubjectGraphTopicsRunInput,
  prepareTopicContentRunInput,
  prepareTopicExpansionRunInput,
} from './prepareGenerationRunSubmit';
import { resolveSubjectGraphRetryContextFromJob } from './subjectGenerationPipelineContext';

type _StudyChecklistKept = StudyChecklist;

const JOB_KIND_TO_STAGE: Partial<Record<ContentGenerationJobKind, Exclude<TopicGenerationStage, 'full'>>> = {
  'topic-theory': 'theory',
  'topic-study-cards': 'study-cards',
  'topic-mini-games': 'mini-games',
  'topic-mini-game-category-sort': 'mini-games',
  'topic-mini-game-sequence-build': 'mini-games',
  'topic-mini-game-match-pairs': 'mini-games',
};

const MINI_GAME_KIND_TO_TYPE: Partial<Record<ContentGenerationJobKind, MiniGameType>> = {
  'topic-mini-game-category-sort': 'CATEGORY_SORT',
  'topic-mini-game-sequence-build': 'SEQUENCE_BUILD',
  'topic-mini-game-match-pairs': 'MATCH_PAIRS',
};

function getEnableReasoningFromJobMetadata(job: ContentGenerationJob): boolean {
  const m = job.metadata;
  if (m && typeof m.enableReasoning === 'boolean') return m.enableReasoning;
  return false;
}

function getNextLevel(job: ContentGenerationJob): number | null {
  const fromMeta = job.metadata?.nextLevel;
  if (typeof fromMeta === 'number') return fromMeta;
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

  const subjectId = job.subjectId!;
  const topicId = job.topicId;
  const enableReasoning = getEnableReasoningFromJobMetadata(job);
  const modelTopic = resolveModelForSurface('topicContent');
  const modelCrystal = resolveModelForSurface('crystalTrial');
  const modelSubjectTopics = resolveModelForSurface('subjectGenerationTopics');
  const capturedAt = () => new Date().toISOString();

  try {
    const stage = JOB_KIND_TO_STAGE[job.kind];
    if (stage && topicId) {
      const miniRedo = MINI_GAME_KIND_TO_TYPE[job.kind];
      const runInput = await prepareTopicContentRunInput(
        deckRepository,
        modelTopic,
        capturedAt(),
        {
          subjectId,
          topicId,
          enableReasoning,
          forceRegenerate: true,
          stage,
          miniGameKindsOverride: miniRedo ? [miniRedo] : undefined,
          retryContext: {
            pipelineRetryOf: null,
            jobRetryOfByStage: { [stage]: job.id },
          },
        },
      );
      await getGenerationClient().submitRun(runInput, {
        idempotencyKey: `retry:job:${job.id}:${Date.now()}`,
      });
      return;
    }

    if (job.kind === 'crystal-trial' && topicId) {
      const trialCurrentLevel = getCrystalTrialCurrentLevel(job);
      if (trialCurrentLevel === null) {
        const errorMessage = `Cannot retry crystal-trial: unable to determine current level from job "${job.label}"`;
        logRetryRoutingCollapse(job.label, errorMessage);
        emitRetryFailed(job, job.label, errorMessage);
        return;
      }

      const runInput = await prepareCrystalTrialRunInput(
        deckRepository,
        modelCrystal,
        capturedAt(),
        subjectId,
        topicId,
        trialCurrentLevel,
        { retryOf: job.id },
      );
      await getGenerationClient().submitRun(runInput, {
        idempotencyKey: `retry:job:${job.id}:${Date.now()}`,
      });
      return;
    }

    if (job.kind === 'topic-expansion-cards' && topicId) {
      const nextLevel = getNextLevel(job);
      if (!nextLevel || nextLevel < 1 || nextLevel > 3) {
        const errorMessage = `Cannot retry expansion: unable to determine crystal level from job "${job.label}"`;
        logRetryRoutingCollapse(job.label, errorMessage);
        emitRetryFailed(job, job.label, errorMessage);
        return;
      }
      const runInput = await prepareTopicExpansionRunInput(
        deckRepository,
        modelTopic,
        capturedAt(),
        subjectId,
        topicId,
        nextLevel as 1 | 2 | 3,
        enableReasoning,
        { retryOf: job.id },
      );
      await getGenerationClient().submitRun(runInput, {
        idempotencyKey: `retry:job:${job.id}:${Date.now()}`,
      });
      return;
    }

    if (job.kind === 'subject-graph-topics' || job.kind === 'subject-graph-edges') {
      const ctx = await resolveSubjectGraphRetryContextFromJob(job);
      if (!ctx) {
        const errorMessage =
          'Cannot retry subject generation: checklist not recoverable from retry metadata, manifest, or label';
        logRetryRoutingCollapse(job.label, errorMessage);
        emitRetryFailed(job, job.label, errorMessage);
        return;
      }
      const runInput = await prepareSubjectGraphTopicsRunInput(
        deckRepository,
        modelSubjectTopics,
        capturedAt(),
        ctx.subjectId,
        ctx.checklist,
        { orchestratorRetryOf: job.id },
      );
      await getGenerationClient().submitRun(runInput, {
        idempotencyKey: `retry:job:${job.id}:${Date.now()}`,
      });
      return;
    }

    const unsupportedMessage = `Cannot retry job: unsupported kind "${job.kind}"`;
    logRetryRoutingCollapse(job.label, unsupportedMessage);
    emitRetryFailed(job, job.label, unsupportedMessage);
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

  const subjectId = failedJob.subjectId;
  const topicId = failedJob.topicId;
  if (!subjectId) return;

  const enableReasoning = getEnableReasoningFromJobMetadata(failedJob);
  const pipelineLabel = store.pipelines[pipelineId]?.label ?? `pipeline ${pipelineId}`;
  const modelTopic = resolveModelForSurface('topicContent');
  const capturedAt = () => new Date().toISOString();

  try {
    const resumeStage = JOB_KIND_TO_STAGE[failedJob.kind];
    if (resumeStage && topicId) {
      const runInput = await prepareTopicContentRunInput(
        deckRepository,
        modelTopic,
        capturedAt(),
        {
          subjectId,
          topicId,
          enableReasoning,
          forceRegenerate: true,
          stage: resumeStage,
          resumeFromStage: resumeStage,
          retryContext: {
            pipelineRetryOf: pipelineId,
            jobRetryOfByStage: { [resumeStage]: failedJob.id },
          },
        },
      );
      await getGenerationClient().submitRun(runInput, {
        idempotencyKey: `retry:pipeline:${pipelineId}:${Date.now()}`,
      });
      return;
    }

    if (failedJob.kind === 'subject-graph-topics' || failedJob.kind === 'subject-graph-edges') {
      await retryFailedJob(failedJob);
      return;
    }

    const unknownMessage = 'Cannot retry pipeline: unknown job kind';
    logRetryRoutingCollapse(pipelineLabel, unknownMessage);
    emitRetryFailed(failedJob, pipelineLabel, unknownMessage);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[retryContentGeneration] retryFailedPipeline error:', msg);
    emitRetryFailed(failedJob, pipelineLabel, msg);
  }
}
