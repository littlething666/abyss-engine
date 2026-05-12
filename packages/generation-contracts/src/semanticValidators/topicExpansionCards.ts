import type { TopicExpansionCardsArtifactPayload } from '../schemas';
import { validateStudyCardLikeCards } from './topicStudyCards';
import type { SemanticValidator } from './types';

/**
 * Semantic validator for `topic-expansion-cards`.
 *
 * Delegates to `validateStudyCardLikeCards` (shared with
 * `topic-study-cards`) so the per-card-content shape, card-pool-size,
 * difficulty-distribution, and duplicate-concept checks stay in
 * lockstep across both kinds without duplicating logic.
 *
 * Expansion-specific behavior is the de-duplication against
 * `SemanticValidatorContext.existingConceptStems`, which the shared
 * validator already handles when the context field is supplied.
 * Pipeline composition roots build the stems from the snapshot's
 * `existing_concept_stems` field and pass them through.
 */
export const validateTopicExpansionCardsArtifact: SemanticValidator<
  TopicExpansionCardsArtifactPayload
> = (payload, context) =>
  validateStudyCardLikeCards(payload.cards, context);
