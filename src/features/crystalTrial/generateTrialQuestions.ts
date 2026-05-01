import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckRepository } from '@/types/repository';
import type { TopicRef } from '@/types/core';
import type { CrystalTrialScenarioQuestion } from '@/types/crystalTrial';
import {
  resolveEnableReasoningForSurface,
  resolveEnableStreamingForSurface,
  resolveModelForSurface,
} from '@/infrastructure/llmInferenceSurfaceProviders';
import { appEventBus } from '@/infrastructure/eventBus';
import { PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION } from '@/types/pipelineFailureDebug';
import { runContentGenerationJob } from '@/features/contentGeneration/runContentGenerationJob';
import {
  buildCrystalTrialMessages,
  serializeCardsForPrompt,
} from '@/features/contentGeneration/messages/buildCrystalTrialMessages';
import { parseCrystalTrialPayload } from '@/features/contentGeneration/parsers/parseCrystalTrialPayload';
import { buildShellPipelineFailureBundle } from '@/features/contentGeneration/debug/buildPipelineFailureDebugBundle';
import { formatPipelineFailureMarkdown } from '@/features/contentGeneration/debug/formatPipelineFailureMarkdown';
import { logPipelineFailure } from '@/features/contentGeneration/debug/logPipelineFailure';
import { useCrystalTrialStore } from './crystalTrialStore';
import { computeCardPoolHash } from './cardPoolHash';
import { MAX_CARD_DIFFICULTY, TRIAL_QUESTION_COUNT } from './crystalTrialConfig';

export interface GenerateTrialQuestionsParams {
  chat: IChatCompletionsRepository;
  deckRepository: IDeckRepository;
  subjectId: string;
  topicId: string;
  currentLevel: number;
  /** If this job is a retry, the ID of the original job. */
  retryOf?: string;
  /** Optional hook after questions are written (status is `awaiting_player`). */
  onQuestionsPersisted?: (ref: TopicRef) => void;
}

export async function generateTrialQuestions(
  params: GenerateTrialQuestionsParams,
): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  const { chat, deckRepository, subjectId, topicId, currentLevel, onQuestionsPersisted, retryOf } = params;
  const ref: TopicRef = { subjectId, topicId };
  const trialStore = useCrystalTrialStore.getState();
  const existingTrial = trialStore.getCurrentTrial(ref);

  // Lifted out so failure events can reference the trial's targetLevel even
  // when an existing trial is in flight (otherwise targetLevel was scoped to
  // the start-pregeneration branch only).
  const targetLevel = existingTrial?.targetLevel ?? currentLevel + 1;
  if (!existingTrial || existingTrial.status === 'failed') {
    trialStore.startPregeneration({ subjectId, topicId, targetLevel });
  }

  const targetDifficulty = Math.min(currentLevel + 1, MAX_CARD_DIFFICULTY);

  // 1. Fetch topic graph node (for title) + all cards
  const [graph, allCards] = await Promise.all([
    deckRepository.getSubjectGraph(subjectId),
    deckRepository.getTopicCards(subjectId, topicId),
  ]);
  const node = graph.nodes.find((n) => n.topicId === topicId);
  const topicTitle = node?.title ?? topicId;

  // 2. Filter cards at difficulty === (crystalLevel + 1), capped at MAX_CARD_DIFFICULTY
  let levelCards = allCards.filter((c) => c.difficulty === targetDifficulty);
  if (levelCards.length === 0) {
    // Fallback for L4→L5: reuse max available difficulty
    levelCards = allCards.filter((c) => c.difficulty === MAX_CARD_DIFFICULTY);
  }
  if (levelCards.length === 0) {
    trialStore.setTrialGenerationFailed(ref);
    const error = `No cards at difficulty ${targetDifficulty}`;
    const shellStartedAt = Date.now();
    const shellBundle = buildShellPipelineFailureBundle({
      schemaVersion: PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION,
      pipelineId: null,
      subjectId,
      topicId,
      topicLabel: topicTitle,
      pipelineStage: 'crystal-trial',
      failedStage: null,
      retryOf: null,
      pipelineRetryOf: null,
      startedAt: shellStartedAt,
      finishedAt: Date.now(),
      error,
    });
    logPipelineFailure(formatPipelineFailureMarkdown(shellBundle));
    appEventBus.emit('crystal-trial:generation-failed', {
      subjectId,
      topicId,
      topicLabel: topicTitle,
      level: targetLevel,
      errorMessage: error,
    });
    return { ok: false, error };
  }

  // 3. Compute card pool hash for invalidation detection
  const cardPoolHash = computeCardPoolHash(levelCards);
  trialStore.setCardPoolHash(ref, cardPoolHash);

  // 4. Serialize card context for LLM (NO theory)
  const cardContext = serializeCardsForPrompt(levelCards);

  // 5. Get optional content brief
  const manifest = await deckRepository.getManifest({ includePregeneratedCurriculums: true });
  const subject = manifest.subjects.find((s) => s.id === subjectId);
  const contentBrief =
    subject?.metadata?.strategy?.content?.contentBrief?.trim() || undefined;

  // 6. Run content generation job
  const model = resolveModelForSurface('crystalTrial');
  const enableReasoning = resolveEnableReasoningForSurface('crystalTrial');
  const enableStreaming = resolveEnableStreamingForSurface('crystalTrial');

  const result = await runContentGenerationJob<CrystalTrialScenarioQuestion[]>({
    kind: 'crystal-trial',
    label: `Crystal Trial L${currentLevel + 1} — ${topicTitle}`,
    pipelineId: null,
    subjectId,
    topicId,
    llmSurfaceId: 'crystalTrial',
    failureDebugContext: {
      topicLabel: topicTitle,
      pipelineStage: 'crystal-trial',
      failedStage: 'trial-questions',
    },
    chat,
    model,
    messages: buildCrystalTrialMessages({
      topicId,
      topicTitle,
      targetLevel: currentLevel + 1,
      cardContext,
      questionCount: TRIAL_QUESTION_COUNT,
      contentBrief,
    }),
    enableReasoning,
    enableStreaming,
    retryOf: retryOf ?? undefined,
    parseOutput: async (raw) => {
      const parsed = parseCrystalTrialPayload(raw);
      if (!parsed.ok) {
        return { ok: false as const, error: parsed.error, parseError: parsed.error };
      }
      return { ok: true as const, data: parsed.questions };
    },
    persistOutput: async (questions) => {
      trialStore.setTrialQuestions(ref, questions);
      onQuestionsPersisted?.(ref);
    },
    metadata: {
      currentLevel,
    },
  });

  if (!result.ok) {
    trialStore.setTrialGenerationFailed(ref);
    appEventBus.emit('crystal-trial:generation-failed', {
      subjectId,
      topicId,
      topicLabel: topicTitle,
      level: targetLevel,
      errorMessage: result.error ?? 'Crystal trial generation failed',
    });
  }
  return { ok: result.ok, jobId: result.jobId, error: result.error };
}
