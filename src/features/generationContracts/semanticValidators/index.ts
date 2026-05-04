/**
 * Public surface for `src/features/generationContracts/semanticValidators`.
 *
 * The module-level barrel (`../index.ts`) re-exports from here. Direct
 * imports of `./semanticValidators/<file>` from outside this directory
 * are not allowed.
 */

export {
  SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT,
  SEMANTIC_MAX_CARD_DIFFICULTY,
  SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST,
  SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE,
} from './_constants';

export type {
  SemanticFailureCode,
  SemanticValidator,
  SemanticValidatorByKind,
  SemanticValidatorContext,
  SemanticValidatorResult,
} from './types';

export { validateSubjectGraphTopicsArtifact } from './subjectGraphTopics';
export { validateSubjectGraphEdgesArtifact } from './subjectGraphEdges';
export { validateTopicTheoryArtifact } from './topicTheory';
export {
  validateTopicStudyCardsArtifact,
  validateStudyCardLikeCards,
} from './topicStudyCards';
export { validateTopicMiniGameCategorySortArtifact } from './topicMiniGameCategorySort';
export { validateTopicMiniGameSequenceBuildArtifact } from './topicMiniGameSequenceBuild';
export { validateTopicMiniGameMatchPairsArtifact } from './topicMiniGameMatchPairs';
export { validateTopicExpansionCardsArtifact } from './topicExpansionCards';
export { validateCrystalTrialArtifact } from './crystalTrial';

export {
  SEMANTIC_VALIDATORS_BY_KIND,
  semanticValidateArtifact,
} from './byKind';
