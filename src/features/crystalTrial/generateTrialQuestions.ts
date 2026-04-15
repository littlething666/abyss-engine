import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckRepository } from '@/types/repository';
import type { TopicRef } from '@/types/core';
import { resolveModelForSurface } from '@/infrastructure/llmInferenceSurfaceProviders';
import { runContentGenerationJob } from '@/features/contentGeneration/runContentGenerationJob';
import {
  buildCrystalTrialMessages,
  serializeCardsForPrompt,
} from '@/features/contentGeneration/messages/buildCrystalTrialMessages';
import { parseCrystalTrialPayload } from '@/features/contentGeneration/parsers/parseCrystalTrialPayload';
import { useCrystalTrialStore } from './crystalTrialStore';
import { computeCardPoolHash } from './cardPoolHash';
import { MAX_CARD_DIFFICULTY, TRIAL_QUESTION_COUNT } from './crystalTrialConfig';

export interface GenerateTrialQuestionsParams {
  chat: IChatCompletionsRepository;
  deckRepository: IDeckRepository;
  subjectId: string;
  topicId: string;
  currentLevel: number;
  /** Optional hook after questions are written (status is `awaiting_player`). */
  onQuestionsPersisted?: (ref: TopicRef) => void;
}

export async function generateTrialQuestions(
  params: GenerateTrialQuestionsParams,
): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  const { chat, deckRepository, subjectId, topicId, currentLevel, onQuestionsPersisted } = params;
  const ref: TopicRef = { subjectId, topicId };
  const trialStore = useCrystalTrialStore.getState();
  const existingTrial = trialStore.getCurrentTrial(ref);

  if (!existingTrial || existingTrial.status === 'failed') {
    const targetLevel = existingTrial?.targetLevel ?? currentLevel + 1;
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
    return { ok: false, error: `No cards at difficulty ${targetDifficulty}` };
  }

  // 3. Compute card pool hash for invalidation detection
  const cardPoolHash = computeCardPoolHash(levelCards);
  trialStore.setCardPoolHash(ref, cardPoolHash);

  // 4. Serialize card context for LLM (NO theory)
  const cardContext = serializeCardsForPrompt(levelCards);

  // 5. Get optional content brief
  const manifest = await deckRepository.getManifest();
  const subject = manifest.subjects.find((s) => s.id === subjectId);
  const contentBrief =
    subject?.metadata?.strategy?.content?.contentBrief?.trim() || undefined;

  // 6. Run content generation job
  const model = resolveModelForSurface('crystalTrial' as any);

  const result = await runContentGenerationJob({
    kind: 'crystal-trial' as any,
    label: `Crystal Trial L${currentLevel + 1} — ${topicTitle}`,
    pipelineId: null,
    subjectId,
    topicId,
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
    enableThinking: false,
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
  }
  return { ok: result.ok, jobId: result.jobId, error: result.error };
}
