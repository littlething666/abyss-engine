import type { Card } from '@/types/core';

/**
 * Compute a deterministic hash string from a set of cards.
 * Used to detect when the card pool changes and the trial needs regeneration.
 * Simple approach: sort card IDs and join — sufficient for change detection.
 */
export function computeCardPoolHash(cards: Card[]): string {
  const ids = cards.map((c) => c.id).sort();
  return ids.join('|');
}
