import { appEventBus } from '@/infrastructure/eventBus';
import { PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION } from '@/types/pipelineFailureDebug';

import { buildShellPipelineFailureBundle } from '../debug/buildPipelineFailureDebugBundle';
import { formatPipelineFailureMarkdown } from '../debug/formatPipelineFailureMarkdown';
import { logPipelineFailure } from '../debug/logPipelineFailure';
import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';
import {
  resolveEnableReasoningForSurface,
  resolveEnableStreamingForSurface,
  resolveModelForSurface,
} from '@/infrastructure/llmInferenceSurfaceProviders';

import { buildTopicExpansionCardsMessages } from '../messages/buildTopicExpansionCardsMessages';
import { parseTopicCardsPayload } from '../parsers/parseTopicCardsPayload';
import { buildExistingConceptRegistry } from '../quality/buildExistingConceptRegistry';
import { buildGroundingJobMetadataSnapshot } from '../grounding/buildGroundingJobMetadata';
import { runContentGenerationJob } from '../runContentGenerationJob';
import { useContentGenerationStore } from '../contentGenerationStore';

export interface RunExpansionJobParams {
  chat: IChatCompletionsRepository;
  deckRepository: IDeckRepository;
  writer: IDeckContentWriter;
  subjectId: string;
  topicId: string;
  nextLevel: number;
  enableReasoning?: boolean;
  signal?: AbortSignal;
  /** If this job is a retry, the ID of the original job. */
  retryOf?: string;
}

export async function runExpansionJob(
  params: RunExpansionJobParams,
): Promise<{ ok: boolean; jobId?: string; error?: string; skipped?: boolean }> {
  const {
    chat,
    deckRepository,
    writer,
    subjectId,
    topicId,
    nextLevel,
    enableReasoning = resolveEnableReasoningForSurface('topicContent'),
    signal,
    retryOf,
  } = params;

  // UPDATED: was (nextLevel < 2 || nextLevel > 3), now L1 through L3.
  // L1 level-up creates difficulty 2, L2 creates diff 3, L3 creates diff 4.
  // Out-of-range runs are silently skipped — no terminal event is emitted
  // because no work was attempted for mentor consumers to react to.
  if (nextLevel < 1 || nextLevel > 3) {
    return { ok: true, skipped: true };
  }

  // Difficulty of cards to generate = nextLevel + 1
  // (L1 -> diff 2, L2 -> diff 3, L3 -> diff 4)
  const difficulty = nextLevel + 1;

  const [details, existingCards] = await Promise.all([
    deckRepository.getTopicDetails(subjectId, topicId),
    deckRepository.getTopicCards(subjectId, topicId),
  ]);
  const bucketKey = difficulty as 2 | 3 | 4;
  const bucket = details.coreQuestionsByDifficulty?.[bucketKey];

  // Resolve a stable topicLabel for any terminal lifecycle event we emit.
  // We start from `details.title` (always present, no extra fetch) and
  // upgrade to the graph node title once we fetch the graph below.
  let topicLabel = details.title || topicId;

  if (!bucket?.length) {
    const error = `No syllabus questions for difficulty bucket ${bucketKey}`;
    const shellStartedAt = Date.now();
    const shellBundle = buildShellPipelineFailureBundle({
      schemaVersion: PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION,
      pipelineId: null,
      subjectId,
      topicId,
      topicLabel,
      pipelineStage: 'topic-expansion',
      failedStage: null,
      retryOf: null,
      pipelineRetryOf: null,
      startedAt: shellStartedAt,
      finishedAt: Date.now(),
      error,
    });
    logPipelineFailure(formatPipelineFailureMarkdown(shellBundle));
    appEventBus.emit('topic-expansion:generation-failed', {
      subjectId,
      topicId,
      topicLabel,
      level: nextLevel,
      errorMessage: error,
    });
    return { ok: false, error };
  }
  const existingRegistry = buildExistingConceptRegistry(existingCards);

  const manifest = await deckRepository.getManifest({ includePregeneratedCurriculums: true });
  const subjectRow = manifest.subjects.find((s) => s.id === subjectId);
  const contentStrategy = subjectRow?.metadata?.strategy?.content;
  const contentBrief = contentStrategy?.contentBrief?.trim() || undefined;

  const graph = await deckRepository.getSubjectGraph(subjectId);
  const node = graph.nodes.find((n) => n.topicId === topicId);
  const topicTitle = node?.title ?? details.title;
  topicLabel = topicTitle || topicLabel;
  const model = resolveModelForSurface('topicContent');
  const enableStreaming = resolveEnableStreamingForSurface('topicContent');

  const theoryExcerpt =
    details.theory.trim().length > 12000
      ? `${details.theory.trim().slice(0, 12000)}\n\n…`
      : details.theory.trim();

  const syllabusQuestions = bucket.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const result = await runContentGenerationJob({
    kind: 'topic-expansion-cards',
    label: `Expansion L${nextLevel} — ${topicTitle}`,
    pipelineId: null,
    subjectId,
    topicId,
    llmSurfaceId: 'topicContent',
    failureDebugContext: {
      topicLabel,
      pipelineStage: 'topic-expansion',
      failedStage: 'expansion-cards',
    },
    chat,
    model,
    messages: buildTopicExpansionCardsMessages({
      topicId,
      topicTitle,
      theoryExcerpt,
      syllabusQuestions,
      difficulty,
      contentStrategy,
      groundingSources: details.groundingSources,
      existingConceptStems: existingRegistry.conceptTargets.slice(0, 80),
      existingMiniGameItemLabels: existingRegistry.miniGameItemLabels.slice(0, 120),
      contentBrief,
    }),
    enableReasoning,
    enableStreaming,
    externalSignal: signal,
    retryOf,
    metadata: {
      nextLevel,
      ...buildGroundingJobMetadataSnapshot(details.groundingSources ?? []),
    },
    parseOutput: async (raw, job) => {
      const parsed = parseTopicCardsPayload(raw, {
        existingRegistry,
        groundingSources: details.groundingSources,
        duplicateRatioThreshold: existingCards.length >= 10 ? 0.1 : undefined,
      });
      if (parsed.qualityReport) {
        useContentGenerationStore.getState().mergeJobMetadata(job.id, {
          qualityReport: parsed.qualityReport,
          validationFailures: parsed.qualityReport.failures,
        });
      }
      if (!parsed.ok) {
        return { ok: false, error: parsed.error, parseError: parsed.error };
      }
      return { ok: true, data: parsed.cards.map((c) => ({ ...c, difficulty })) };
    },
    persistOutput: async (normalized) => {
      await writer.appendTopicCards(subjectId, topicId, normalized);
    },
  });

  if (result.ok) {
    appEventBus.emit('topic-expansion:generation-completed', {
      subjectId,
      topicId,
      topicLabel,
      level: nextLevel,
    });
  } else {
    appEventBus.emit('topic-expansion:generation-failed', {
      subjectId,
      topicId,
      topicLabel,
      level: nextLevel,
      errorMessage: result.error ?? 'Topic expansion job failed',
    });
  }

  return { ok: result.ok, jobId: result.jobId, error: result.error };
}
