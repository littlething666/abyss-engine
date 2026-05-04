import type { TopicStudyCardsArtifactPayload } from '../schemas';
import { SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE } from './_constants';
import {
  extractConceptStem,
  normalizeConceptStem,
  validateCardContentByType,
  type StudyCardLikeType,
} from './cardContentShape';
import type {
  SemanticValidator,
  SemanticValidatorContext,
  SemanticValidatorResult,
} from './types';

type StudyCardLike = {
  id: string;
  topicId: string;
  type: StudyCardLikeType;
  content: Record<string, unknown>;
  difficulty: number;
};

/**
 * Shared validator body for `topic-study-cards` and
 * `topic-expansion-cards` (both share the per-card envelope; expansion
 * additionally dedupes against `existingConceptStems`).
 *
 * Checks (in order, fail-loud on the first violation):
 * 1. Pool size >= `context.minCardPoolSize ?? SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE`.
 * 2. Card ids unique within the artifact.
 * 3. Per-card-content shape matches the card's `type` literal
 *    (`validateCardContentByType`).
 * 4. Concept-stem dedup within the artifact (case-insensitive trim).
 * 5. Concept-stem dedup against `existingConceptStems` when supplied.
 * 6. Pool spans at least 2 distinct difficulty tiers — catches drift
 *    where the model emits a flat single-tier pool. Per-tier balance
 *    targets are deferred to a later prompt-quality pass.
 */
export function validateStudyCardLikeCards(
  cards: ReadonlyArray<StudyCardLike>,
  context: SemanticValidatorContext | undefined,
): SemanticValidatorResult {
  const minPool = context?.minCardPoolSize ?? SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE;
  if (cards.length < minPool) {
    return {
      ok: false,
      failureCode: 'validation:semantic-card-pool-size',
      message: `Card pool too small: ${cards.length} < ${minPool}`,
      path: 'cards',
    };
  }
  const existing = new Set(
    (context?.existingConceptStems ?? []).map((s) => normalizeConceptStem(s)),
  );
  const seenIds = new Set<string>();
  const seenStems = new Set<string>();
  const tiersSeen = new Set<number>();
  for (let i = 0; i < cards.length; i += 1) {
    const c = cards[i];
    if (seenIds.has(c.id)) {
      return {
        ok: false,
        failureCode: 'validation:semantic-duplicate-concept',
        message: `Duplicate card id at cards[${i}]: ${c.id}`,
        path: `cards[${i}].id`,
      };
    }
    seenIds.add(c.id);
    tiersSeen.add(c.difficulty);
    const contentErr = validateCardContentByType(c.type, c.content);
    if (contentErr !== null) {
      return {
        ok: false,
        failureCode: 'validation:semantic-card-content-shape',
        message: `cards[${i}] (type ${c.type}) has invalid content: ${contentErr}`,
        path: `cards[${i}].content`,
      };
    }
    const rawStem = extractConceptStem(c);
    if (rawStem !== null) {
      const norm = normalizeConceptStem(rawStem);
      if (seenStems.has(norm)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-duplicate-concept',
          message: `Duplicate concept stem at cards[${i}]: "${rawStem}"`,
          path: `cards[${i}]`,
        };
      }
      if (existing.has(norm)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-duplicate-concept',
          message: `Card at cards[${i}] duplicates an existing concept stem: "${rawStem}"`,
          path: `cards[${i}]`,
        };
      }
      seenStems.add(norm);
    }
  }
  if (tiersSeen.size < 2) {
    return {
      ok: false,
      failureCode: 'validation:semantic-difficulty-distribution',
      message: `Card pool spans only ${tiersSeen.size} distinct difficulty tier(s); need at least 2`,
      path: 'cards',
    };
  }
  return { ok: true };
}

/**
 * Semantic validator for `topic-study-cards`.
 *
 * Delegates to `validateStudyCardLikeCards` so the per-card-content
 * shape, card-pool-size, difficulty-distribution, and duplicate-concept
 * checks stay in lockstep with the expansion validator without
 * duplicating logic.
 */
export const validateTopicStudyCardsArtifact: SemanticValidator<
  TopicStudyCardsArtifactPayload
> = (payload, context) => validateStudyCardLikeCards(payload.cards, context);
