import { Card, MultiChoiceContent, SingleChoiceContent } from '../../types/core';

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
    const singleChoiceContent = card.content as SingleChoiceContent;
    const selectedSet = new Set(selectedAnswers);
    return selectedSet.has(singleChoiceContent.correctAnswer);
  }

  const selectedSet = new Set(selectedAnswers);
  const multipleChoiceContent = card.content as MultiChoiceContent;
  const correctAnswers = multipleChoiceContent.correctAnswers;
  const correctSet = new Set(correctAnswers ?? []);

  if (selectedSet.size !== correctSet.size) {
    return false;
  }

  return correctSet.size > 0 && Array.from(correctSet).every((answer) => selectedSet.has(answer));
}
