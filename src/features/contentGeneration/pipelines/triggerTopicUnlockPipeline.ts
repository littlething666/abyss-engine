import { appEventBus } from '@/infrastructure/eventBus';
import type { SubjectTopicRef } from '@/lib/topicRef';

export function triggerTopicUnlockPipeline(
  ref: SubjectTopicRef,
  options?: { enableThinking?: boolean; signal?: AbortSignal },
): void {
  appEventBus.emit('topic:unlock-pipeline', {
    subjectId: ref.subjectId,
    topicId: ref.topicId,
    enableThinking: options?.enableThinking ?? false,
  });
}
