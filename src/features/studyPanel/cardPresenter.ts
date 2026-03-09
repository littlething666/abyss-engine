import { Card } from '../../types/core';

export type RenderableType = 'flashcard' | 'single_choice' | 'multi_choice';

export interface RenderableCard {
  id: string;
  type: RenderableType;
  question: string;
  answer?: string;
  options?: string[];
  correctAnswers?: string[];
  context?: string;
}

export function toRenderableCard(card: Card): RenderableCard | null {
  if (!card?.id) return null;

  if (card.type === 'FLASHCARD') {
    const content = card.content as { front: string; back: string };
    return {
      id: card.id,
      type: 'flashcard',
      question: content.front,
      answer: content.back,
    };
  }

  if (card.type === 'SINGLE_CHOICE') {
    const content = card.content as {
      question: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
    };

    return {
      id: card.id,
      type: 'single_choice',
      question: content.question,
      options: content.options,
      correctAnswers: [content.correctAnswer],
      context: content.explanation,
    };
  }

  const content = card.content as {
    question: string;
    options: string[];
    correctAnswers: string[];
    explanation: string;
  };

  return {
    id: card.id,
    type: 'multi_choice',
    question: content.question,
    options: content.options,
    correctAnswers: content.correctAnswers,
    context: content.explanation,
  };
}

