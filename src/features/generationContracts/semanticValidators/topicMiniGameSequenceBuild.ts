import type { TopicMiniGameSequenceBuildArtifactPayload } from '../schemas';
import type { SemanticValidator } from './types';

/**
 * Semantic validator for `topic-mini-game-sequence-build`.
 *
 * The strict Zod schema already enforces the structural envelope
 * (`gameType: 'SEQUENCE_BUILD'`, >=2 steps, each `order` is a positive
 * integer). This validator adds the playability rules the envelope
 * cannot encode:
 * 1. Step `id` values are unique within a card.
 * 2. The set of `order` values is exactly `{1, 2, ..., steps.length}` —
 *    no gaps, no duplicates, no off-by-one. Without contiguity the UI
 *    cannot render a meaningful sequence.
 */
export const validateTopicMiniGameSequenceBuildArtifact: SemanticValidator<
  TopicMiniGameSequenceBuildArtifactPayload
> = (payload) => {
  for (let i = 0; i < payload.cards.length; i += 1) {
    const card = payload.cards[i];
    const steps = card.content.steps;
    const ids = new Set<string>();
    const orders = new Set<number>();
    for (let j = 0; j < steps.length; j += 1) {
      const s = steps[j];
      if (ids.has(s.id)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-mini-game-playability',
          message: `Duplicate step id at cards[${i}].content.steps[${j}]: ${s.id}`,
          path: `cards[${i}].content.steps[${j}].id`,
        };
      }
      ids.add(s.id);
      if (orders.has(s.order)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-mini-game-playability',
          message: `Duplicate step order at cards[${i}].content.steps[${j}]: ${s.order}`,
          path: `cards[${i}].content.steps[${j}].order`,
        };
      }
      orders.add(s.order);
    }
    for (let n = 1; n <= steps.length; n += 1) {
      if (!orders.has(n)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-mini-game-playability',
          message: `Missing step order ${n} at cards[${i}] (sequence must be contiguous 1..${steps.length})`,
          path: `cards[${i}].content.steps`,
        };
      }
    }
  }
  return { ok: true };
};
