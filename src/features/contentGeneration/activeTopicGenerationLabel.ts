import type { ContentGenerationJobStatus } from '@/types/contentGeneration';

import type { ContentGenerationState } from './contentGenerationStore';

function isInFlightJobStatus(status: ContentGenerationJobStatus): boolean {
  return (
    status === 'pending' ||
    status === 'streaming' ||
    status === 'parsing' ||
    status === 'saving'
  );
}

/** Label of an in-flight generation job for this topic ref, or null if none. */
export function activeTopicGenerationLabel(
  state: Pick<ContentGenerationState, 'jobs'>,
  subjectId: string,
  topicId: string,
): string | null {
  for (const j of Object.values(state.jobs)) {
    if (j.subjectId === subjectId && j.topicId === topicId && isInFlightJobStatus(j.status)) {
      return j.label;
    }
  }
  return null;
}

/**
 * Like {@link activeTopicGenerationLabel}, but ignores `crystal-trial` jobs.
 * Trial pregeneration shares the content-generation store; study/session UI
 * should not treat trial LLM work as blocking topic study content.
 */
export function activeTopicContentGenerationLabel(
  state: Pick<ContentGenerationState, 'jobs'>,
  subjectId: string,
  topicId: string,
): string | null {
  for (const j of Object.values(state.jobs)) {
    if (j.kind === 'crystal-trial') {
      continue;
    }
    if (j.subjectId === subjectId && j.topicId === topicId && isInFlightJobStatus(j.status)) {
      return j.label;
    }
  }
  return null;
}
