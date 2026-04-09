import { deckRepository, deckWriter } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';

import { runTopicUnlockPipeline } from './runTopicUnlockPipeline';

export function triggerTopicUnlockPipeline(
  subjectId: string,
  topicId: string,
  options?: { enableThinking?: boolean; signal?: AbortSignal },
): Promise<{ ok: boolean; pipelineId: string; error?: string }> {
  return runTopicUnlockPipeline({
    chat: getChatCompletionsRepositoryForSurface('topicContent'),
    deckRepository,
    writer: deckWriter,
    subjectId,
    topicId,
    enableThinking: options?.enableThinking ?? false,
    signal: options?.signal,
  });
}
