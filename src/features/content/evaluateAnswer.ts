import { Card } from '../../types/core';

export function evaluateAnswer(card: Card, selectedAnswers: string[]): boolean {
  if (card.type !== 'SINGLE_CHOICE' && card.type !== 'MULTI_CHOICE') {
    return false;
  }

  if (!Array.isArray(selectedAnswers) || selectedAnswers.length === 0) {
    return false;
  }

  if (card.type === 'SINGLE_CHOICE') {
    if (selectedAnswers.length !== 1) {
      return false;
    }
    const selectedSet = new Set(selectedAnswers);
    return selectedSet.has(card.content.correctAnswer);
  }

  const selectedSet = new Set(selectedAnswers);
  const correctAnswers = card.content.correctAnswers;
  const correctSet = new Set(correctAnswers ?? []);

  if (selectedSet.size !== correctSet.size) {
    return false;
  }

  return correctSet.size > 0 && Array.from(correctSet).every((answer) => selectedSet.has(answer));
}
