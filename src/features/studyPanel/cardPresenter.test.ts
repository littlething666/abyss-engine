import { describe, expect, it } from 'vitest';

import { toRenderableCard } from './cardPresenter';

describe('toRenderableCard', () => {
  it('maps flashcards into renderable flashcards', () => {
    const card = {
      id: 'card-1',
      type: 'FLASHCARD' as const,
      difficulty: 1,
      content: {
        front: 'Question front',
        back: 'Answer back',
      },
    };

    const rendered = toRenderableCard(card);
    expect(rendered).toEqual({
      id: 'card-1',
      type: 'flashcard',
      question: 'Question front',
      answer: 'Answer back',
    });
  });

  it('maps single choice cards into renderable single choice cards', () => {
    const card = {
      id: 'card-2',
      type: 'SINGLE_CHOICE' as const,
      difficulty: 2,
      content: {
        question: 'What is 2 + 2?',
        options: ['1', '2', '3', '4'],
        correctAnswer: '4',
        explanation: 'Because 2 + 2 = 4',
      },
    };

    const rendered = toRenderableCard(card);
    expect(rendered).toMatchObject({
      id: 'card-2',
      type: 'single_choice',
      question: 'What is 2 + 2?',
      options: ['1', '2', '3', '4'],
      correctAnswers: ['4'],
      context: 'Because 2 + 2 = 4',
    });
  });
});

