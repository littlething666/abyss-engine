import type { Card, TopicDetails } from '@/types/core';

/** True when the topic has generated theory and at least one difficulty-1 card (study-ready). */
export function topicStudyContentReady(details: TopicDetails, cards: Card[]): boolean {
  if (!details.theory.trim()) {
    return false;
  }
  return cards.some((c) => c.difficulty === 1);
}
