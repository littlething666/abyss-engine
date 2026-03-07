import { describe, it, expect } from 'vitest';

import { Card } from '../../types/core';
import { evaluateAnswer } from './evaluateAnswer';

function createSingleChoiceCard(): Card {
  return {
    id: 'single-card',
    type: 'SINGLE_CHOICE',
    difficulty: 1,
    content: {
      question: 'Which is true?',
      options: ['A', 'B', 'C'],
      correctAnswer: 'B',
      explanation: 'Choice B is correct.',
    },
  };
}

function createMultiChoiceCard(): Card {
  return {
    id: 'multi-card',
    type: 'MULTI_CHOICE',
    difficulty: 1,
    content: {
      question: 'Select all valid',
      options: ['A', 'B', 'C', 'D'],
      correctAnswers: ['A', 'C'],
      explanation: 'A and C are valid.',
    },
  };
}

describe('evaluateAnswer', () => {
  it('marks single choice correct when exact answer is selected', () => {
    const card = createSingleChoiceCard();
    expect(evaluateAnswer(card, ['B'])).toBe(true);
  });

  it('marks single choice incorrect when selected answers include extras', () => {
    const card = createSingleChoiceCard();
    expect(evaluateAnswer(card, ['A', 'B'])).toBe(false);
  });

  it('marks single choice incorrect when wrong answer is selected', () => {
    const card = createSingleChoiceCard();
    expect(evaluateAnswer(card, ['A'])).toBe(false);
  });

  it('marks multi-choice correct when all and only correct answers are selected', () => {
    const card = createMultiChoiceCard();
    expect(evaluateAnswer(card, ['C', 'A'])).toBe(true);
  });

  it('marks single choice incorrect when duplicate selections are submitted', () => {
    const card = createSingleChoiceCard();
    expect(evaluateAnswer(card, ['B', 'B'])).toBe(false);
  });

  it('marks multi-choice incorrect when selections are missing', () => {
    const card = createMultiChoiceCard();
    expect(evaluateAnswer(card, ['A'])).toBe(false);
  });

  it('marks multi-choice incorrect when extra answers are selected', () => {
    const card = createMultiChoiceCard();
    expect(evaluateAnswer(card, ['A', 'B', 'C'])).toBe(false);
  });

  it('ignores non-choice cards as answer questions', () => {
    const flashcard: Card = {
      id: 'flash-card',
      type: 'FLASHCARD',
      difficulty: 1,
      content: {
        front: 'front',
        back: 'back',
      },
    };
    expect(evaluateAnswer(flashcard, ['anything'])).toBe(false);
  });
});
