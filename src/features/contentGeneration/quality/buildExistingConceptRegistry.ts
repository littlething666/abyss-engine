import type {
  Card,
  CategorySortContent,
  ConnectionWebContent,
  SequenceBuildContent,
} from '@/types/core';
import type { ExistingConceptRegistry } from '@/types/contentQuality';
import { extractConceptTarget } from './extractConceptTarget';

function miniGameLabels(card: Card): string[] {
  if (card.type !== 'MINI_GAME') return [];
  const content = card.content as CategorySortContent | SequenceBuildContent | ConnectionWebContent;
  if (content.gameType === 'CATEGORY_SORT') {
    return [
      ...content.categories.map((category) => category.label),
      ...content.items.map((item) => item.label),
    ];
  }
  if (content.gameType === 'SEQUENCE_BUILD') {
    return content.items.map((item) => item.label);
  }
  return [
    ...content.pairs.flatMap((pair) => [pair.left, pair.right]),
    ...(content.distractors ?? []).map((distractor) => distractor.label),
  ];
}

export function buildExistingConceptRegistry(cards: Card[]): ExistingConceptRegistry {
  return {
    conceptTargets: cards.map(extractConceptTarget).filter((target) => target.length > 0),
    miniGameItemLabels: cards.flatMap(miniGameLabels).filter((label) => label.trim().length > 0),
    cardIds: cards.map((card) => card.id),
  };
}
