import { ActiveCrystal, Card } from '../../types/core';
import { calculateLevelFromXP } from '../progression';
import { TopicMetadata } from '../content/selectors';

export function buildPriorKnowledgeLines(
  activeCrystals: ActiveCrystal[],
  unlockedTopicIds: string[],
  topicMetadata: Record<string, TopicMetadata>,
): string {
  const entries = unlockedTopicIds
    .map((topicId) => {
      const topicName = topicMetadata[topicId]?.topicName || topicId;
      const crystal = activeCrystals.find((item) => item.topicId === topicId);
      const level = calculateLevelFromXP(crystal?.xp ?? 0);
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
    const fromSession = cards.find((card) => card.id === sessionCardId);
    if (fromSession) {
      return fromSession;
    }
  }

  if (currentCardId) {
    return cards.find((card) => card.id === currentCardId) || null;
  }

  return null;
}

