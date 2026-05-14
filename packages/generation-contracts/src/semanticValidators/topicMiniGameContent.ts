import type { TopicMiniGameContentArtifactPayload } from '../schemas';
import { validateTopicMiniGameCategorySortArtifact } from './topicMiniGameCategorySort';
import { validateTopicMiniGameMatchPairsArtifact } from './topicMiniGameMatchPairs';
import { validateTopicMiniGameSequenceBuildArtifact } from './topicMiniGameSequenceBuild';
import type { SemanticValidator } from './types';

/** Semantic validator for one planned mini-game content artifact. */
export const validateTopicMiniGameContentArtifact: SemanticValidator<
  TopicMiniGameContentArtifactPayload
> = (payload) => {
  const broadPayload = { cards: [payload.card] };
  if (payload.card.content.gameType === 'CATEGORY_SORT') {
    return (validateTopicMiniGameCategorySortArtifact as SemanticValidator<unknown>)(broadPayload);
  }
  if (payload.card.content.gameType === 'SEQUENCE_BUILD') {
    return (validateTopicMiniGameSequenceBuildArtifact as SemanticValidator<unknown>)(broadPayload);
  }
  return (validateTopicMiniGameMatchPairsArtifact as SemanticValidator<unknown>)(broadPayload);
};
