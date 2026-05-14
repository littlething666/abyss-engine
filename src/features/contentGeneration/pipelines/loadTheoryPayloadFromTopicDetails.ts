import type { TopicDetails } from '@/types/core';

export interface LoadedTopicTheoryPayload {
  coreConcept: string;
  theory: string;
  keyTakeaways: string[];
  coreQuestionsByDifficulty: {
    1: string[];
    2: string[];
    3: string[];
    4: string[];
  };
  groundingSources: NonNullable<TopicDetails['groundingSources']>;
}

/**
 * Reconstructs the theory payload used by study-card and mini-game stages from persisted topic details.
 *
 * This shape intentionally lives beside the persisted-read helper instead of
 * importing the deprecated permissive topic-theory parser. Pipeline code must
 * reconstruct from already-published Learning Content fields, not reach back
 * into LLM-response parser modules.
 */
export function loadTheoryPayloadFromTopicDetails(details: TopicDetails): LoadedTopicTheoryPayload {
  const theory = details.theory?.trim() ?? '';
  if (!theory) {
    throw new Error('Cannot load theory payload: topic theory is missing or blank.');
  }

  const coreConcept = details.coreConcept?.trim() ?? '';
  if (!coreConcept) {
    throw new Error('Cannot load theory payload: coreConcept is missing or blank.');
  }

  const keyTakeaways = details.keyTakeaways ?? [];
  if (keyTakeaways.length < 4) {
    throw new Error('Cannot load theory payload: at least four key takeaways are required.');
  }

  const cq = details.coreQuestionsByDifficulty;
  if (!cq?.['1']?.length || !cq['2']?.length || !cq['3']?.length || !cq['4']?.length) {
    throw new Error('Cannot load theory payload: coreQuestionsByDifficulty must include keys 1–4 with questions.');
  }

  return {
    coreConcept,
    theory,
    keyTakeaways,
    coreQuestionsByDifficulty: {
      1: cq['1'] as string[],
      2: cq['2'] as string[],
      3: cq['3'] as string[],
      4: cq['4'] as string[],
    },
    groundingSources: details.groundingSources ?? [],
  };
}
