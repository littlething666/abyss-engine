import { parseCardRefKey, topicRefKey } from '@/lib/topicRef';
import { calculateLevelFromXP } from '@/types/crystalLevel';
import { ActiveCrystal, Card } from '../../types/core';
import { TopicMetadata } from '../content/selectors';

export function buildPriorKnowledgeLines(
  activeCrystals: ActiveCrystal[],
  topicMetadata: Record<string, TopicMetadata>,
): string {
  const entries = activeCrystals
    .map((crystal) => {
      const key = topicRefKey(crystal);
      const topicName = topicMetadata[key]?.topicName || crystal.topicId;
      const level = calculateLevelFromXP(crystal.xp ?? 0);
      if (level <= 0) {
        return null;
      }

      return {
        topicName,
        level,
      };
    })
    .filter((entry): entry is { topicName: string; level: number } => entry !== null)
    .sort((a, b) => a.topicName.localeCompare(b.topicName));

  if (entries.length === 0) {
    return 'unknown';
  }

  return entries.map((entry) => `- ${entry.topicName} - Level ${entry.level}`).join('\n');
}

export function resolveActiveCard(
  cards: Card[],
  sessionCardId?: string | null,
  currentCardId?: string | null,
): Card | null {
  if (sessionCardId) {
    let rawId = sessionCardId;
    try {
      rawId = parseCardRefKey(sessionCardId).cardId;
    } catch {
      // ignore — treat as raw per-topic id
    }
    const fromSession = cards.find((card) => card.id === rawId);
    if (fromSession) {
      return fromSession;
    }
  }

  if (currentCardId) {
    return cards.find((card) => card.id === currentCardId) || null;
  }

  return null;
}
