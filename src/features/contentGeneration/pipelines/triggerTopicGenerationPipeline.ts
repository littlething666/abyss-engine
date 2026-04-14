import { appEventBus } from '@/infrastructure/eventBus';

import type { TopicGenerationStage } from './topicGenerationStage';

export function triggerTopicGenerationPipeline(
  subjectId: string,
  topicId: string,
  options?: {
    enableThinking?: boolean;
    signal?: AbortSignal;
    forceRegenerate?: boolean;
    stage?: TopicGenerationStage;
  },
): void {
  appEventBus.emit('topic:generation-pipeline', {
    subjectId,
    topicId,
    enableThinking: options?.enableThinking ?? false,
    forceRegenerate: options?.forceRegenerate,
    stage: options?.stage,
  });
}
