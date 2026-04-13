import type { Card } from '@/types/core';

/**
 * Ensures card IDs are globally unique by prefixing with subject and topic context.
 *
 * LLM-generated card IDs are topic-local (e.g. `descstat-1-flashcard`). Without
 * prefixing, two subjects sharing a `topicId` would produce colliding card IDs,
 * breaking `sm2Data` which is keyed by `cardId`.
 *
 * If a card ID already contains the prefix, it is left unchanged.
 *
 * @example
 * ```ts
 * ensureGlobalCardIdPrefix(cards, 'math-101', 'linear-algebra');
 * // card.id: 'descstat-1-flashcard' → 'math-101/linear-algebra/descstat-1-flashcard'
 * ```
 */
export function ensureGlobalCardIdPrefix(
  cards: Card[],
  subjectId: string,
  topicId: string,
): Card[] {
  const prefix = `${subjectId}/${topicId}/`;
  return cards.map((card) => ({
    ...card,
    id: card.id.startsWith(prefix) ? card.id : `${prefix}${card.id}`,
  }));
}
