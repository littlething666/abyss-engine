import type { TopicMiniGameMatchPairsArtifactPayload } from '../schemas';
import type { SemanticValidator } from './types';

/**
 * Semantic validator for `topic-mini-game-match-pairs`.
 *
 * The strict Zod schema already enforces the structural envelope
 * (`gameType: 'MATCH_PAIRS'`, >=2 pairs, each pair has `id`/`left`/`right`
 * non-empty). This validator adds the playability rules the envelope
 * cannot encode — Match Pairs is a strict 1:1 permutation per the
 * `MatchPairsContent` type comment in `src/types/core.ts`, so:
 * 1. Pair `id` values are unique within a card.
 * 2. `left` values are unique (case-insensitive trim) within a card.
 * 3. `right` values are unique (case-insensitive trim) within a card.
 *
 * Without these guarantees the UI's right-column rearrangement gesture
 * has no unique correct alignment, breaking the gameplay contract.
 */
export const validateTopicMiniGameMatchPairsArtifact: SemanticValidator<
  TopicMiniGameMatchPairsArtifactPayload
> = (payload) => {
  for (let i = 0; i < payload.cards.length; i += 1) {
    const card = payload.cards[i];
    const pairs = card.content.pairs;
    const pairIds = new Set<string>();
    const lefts = new Set<string>();
    const rights = new Set<string>();
    for (let j = 0; j < pairs.length; j += 1) {
      const p = pairs[j];
      if (pairIds.has(p.id)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-mini-game-playability',
          message: `Duplicate pair id at cards[${i}].content.pairs[${j}]: ${p.id}`,
          path: `cards[${i}].content.pairs[${j}].id`,
        };
      }
      pairIds.add(p.id);
      const lkey = p.left.trim().toLowerCase();
      if (lefts.has(lkey)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-mini-game-playability',
          message: `Duplicate left value at cards[${i}].content.pairs[${j}]: ${p.left}`,
          path: `cards[${i}].content.pairs[${j}].left`,
        };
      }
      lefts.add(lkey);
      const rkey = p.right.trim().toLowerCase();
      if (rights.has(rkey)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-mini-game-playability',
          message: `Duplicate right value at cards[${i}].content.pairs[${j}]: ${p.right}`,
          path: `cards[${i}].content.pairs[${j}].right`,
        };
      }
      rights.add(rkey);
    }
  }
  return { ok: true };
};
