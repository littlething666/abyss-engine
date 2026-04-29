import { appEventBus } from '@/infrastructure/eventBus';

import type { TopicGenerationStage } from './topicGenerationStage';

export function triggerTopicGenerationPipeline(
  subjectId: string,
  topicId: string,
  options?: {
    enableReasoning?: boolean;
    signal?: AbortSignal;
    forceRegenerate?: boolean;
    stage?: TopicGenerationStage;
  },
): void {
  appEventBus.emit('topic-content:generation-requested', {
    subjectId,
    topicId,
    ...(options?.enableReasoning !== undefined ? { enableReasoning: options.enableReasoning } : {}),
    forceRegenerate: options?.forceRegenerate,
    stage: options?.stage,
  });
}
