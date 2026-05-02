import type {
  Card,
  CategorySortContent,
  FlashcardContent,
  MatchPairsContent,
  MultiChoiceContent,
  SequenceBuildContent,
  SingleChoiceContent,
} from '@/types/core';

function normalizeConceptText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[$`*_~()[\]{}.,!?;:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractConceptTarget(card: Card): string {
  if (card.conceptTarget?.trim()) return normalizeConceptText(card.conceptTarget);
  const content = card.content;
  if (card.type === 'FLASHCARD') {
    const flashcard = content as FlashcardContent;
    return normalizeConceptText(`${flashcard.front} ${flashcard.back}`);
  }
  if (card.type === 'SINGLE_CHOICE') {
    const choice = content as SingleChoiceContent;
    return normalizeConceptText(`${choice.question} ${choice.correctAnswer}`);
  }
  if (card.type === 'MULTI_CHOICE') {
    const choice = content as MultiChoiceContent;
    return normalizeConceptText(`${choice.question} ${choice.correctAnswers.join(' ')}`);
  }
  const miniGame = content as CategorySortContent | SequenceBuildContent | MatchPairsContent;
  if (miniGame.gameType === 'CATEGORY_SORT') {
    return normalizeConceptText(`${miniGame.prompt} ${miniGame.categories.map((c) => c.label).join(' ')}`);
  }
  if (miniGame.gameType === 'SEQUENCE_BUILD') {
    return normalizeConceptText(`${miniGame.prompt} ${miniGame.items.map((i) => i.label).join(' ')}`);
  }
  return normalizeConceptText(`${miniGame.prompt} ${miniGame.pairs.map((p) => `${p.left} ${p.right}`).join(' ')}`);
}
