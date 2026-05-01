import type { TopicDetails } from '@/types/core';

import type { ParsedTopicTheoryContentPayload } from '../parsers/parseTopicTheoryContentPayload';

/**
 * Reconstructs the theory payload used by study-card and mini-game stages from persisted topic details.
 */
export function loadTheoryPayloadFromTopicDetails(details: TopicDetails): ParsedTopicTheoryContentPayload {
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
