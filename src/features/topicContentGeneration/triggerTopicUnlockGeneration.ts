import { deckRepository, deckWriter } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';

import { runTopicUnlockGeneration } from './runTopicUnlockGeneration';

export function triggerTopicUnlockGeneration(
  subjectId: string,
  topicId: string,
  options?: { enableThinking?: boolean; signal?: AbortSignal },
): Promise<{ ok: boolean; error?: string }> {
  return runTopicUnlockGeneration({
    chat: getChatCompletionsRepositoryForSurface('topicContent'),
    deckRepository,
    writer: deckWriter,
    subjectId,
    topicId,
    enableThinking: options?.enableThinking ?? false,
    signal: options?.signal,
  });
}
