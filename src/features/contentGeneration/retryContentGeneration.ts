/**
 * Retry bridge for failed/aborted content generation jobs and pipelines.
 */

import type {
  ContentGenerationJob,
  ContentGenerationJobKind,
  ContentGenerationPipeline,
  TopicPipelineRetryStage,
} from '@/types/contentGeneration';
import type { MiniGameType } from '@/types/core';
import type { StudyChecklist } from '@/types/studyChecklist';
import type { TopicGenerationStage } from './pipelines/topicGenerationStage';
import { useContentGenerationStore } from './contentGenerationStore';
import { failureKeyForRetryRoutingInstance } from './failureKeys';
import { appEventBus } from '@/infrastructure/eventBus';
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

  try {
    const stage = JOB_KIND_TO_STAGE[job.kind];
    if (stage && topicId) {
      const jobRetryOfByStage: Partial<Record<TopicPipelineRetryStage, string>> = { [stage]: job.id };
      const miniRedo = MINI_GAME_KIND_TO_TYPE[job.kind];
      await runTopicGenerationPipeline({
        chat: getChatCompletionsRepositoryForSurface('topicContent'),
        deckRepository,
        writer: deckWriter,
        subjectId,
        topicId,
        enableReasoning,
        forceRegenerate: true,
        stage,
        retryContext: {
          pipelineRetryOf: null,
          jobRetryOfByStage,
        },
        ...(miniRedo ? { miniGameKindsOverride: [miniRedo] } : {}),
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

      await generateTrialQuestions({
        chat: getChatCompletionsRepositoryForSurface('crystalTrial'),
        deckRepository,
        subjectId,
        topicId,
        currentLevel: trialCurrentLevel,
        retryOf: job.id,
      });
      return;
    }

    if (job.kind === 'topic-expansion-cards' && topicId) {
      const nextLevel = getNextLevel(job);
      if (!nextLevel) {
        const errorMessage = `Cannot retry expansion: unable to determine crystal level from job "${job.label}"`;
        logRetryRoutingCollapse(job.label, errorMessage);
        emitRetryFailed(job, job.label, errorMessage);
        return;
      }
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

    if (job.kind === 'subject-graph-topics' || job.kind === 'subject-graph-edges') {
      const ctx = await resolveSubjectGraphRetryContextFromJob(job);
      if (!ctx) {
        const errorMessage =
          'Cannot retry subject generation: checklist not recoverable from retry metadata, manifest, or label';
        logRetryRoutingCollapse(job.label, errorMessage);
        emitRetryFailed(job, job.label, errorMessage);
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

  try {
    const resumeStage = JOB_KIND_TO_STAGE[failedJob.kind];
    if (resumeStage && topicId) {
      await runTopicGenerationPipeline({
        chat: getChatCompletionsRepositoryForSurface('topicContent'),
        deckRepository,
        writer: deckWriter,
        subjectId,
        topicId,
        enableReasoning,
        forceRegenerate: true,
        resumeFromStage: resumeStage,
        retryContext: {
          pipelineRetryOf: pipelineId,
          jobRetryOfByStage: { [resumeStage]: failedJob.id },
        },
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
