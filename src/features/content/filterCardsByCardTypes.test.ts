import { describe, it, expect } from 'vitest';

import type { Card } from '../../types/core';
import { filterCardsByCardTypes, filterCardsForStudy } from './filterCardsByCardTypes';

function card(id: string, type: Card['type']): Card {
  if (type === 'FLASHCARD') {
    return { id, type, difficulty: 1, content: { front: 'f', back: 'b' } };
  }
  if (type === 'SINGLE_CHOICE') {
    return {
      id,
      type,
      difficulty: 1,
      content: { question: 'q', options: ['a'], correctAnswer: 'a', explanation: 'e' },
    };
  }
  if (type === 'MULTI_CHOICE') {
    return {
      id,
      type,
      difficulty: 1,
      content: { question: 'q', options: ['a'], correctAnswers: ['a'], explanation: 'e' },
    };
  }
  return {
    id,
    type: 'MINI_GAME',
    difficulty: 1,
    content: {
      gameType: 'CATEGORY_SORT',
      prompt: 'p',
      categories: [{ id: 'c1', label: 'C' }],
      items: [{ id: 'i1', label: 'L', categoryId: 'c1' }],
      explanation: 'e',
    },
  };
}

function miniGameCard(
  id: string,
  gameType: 'CATEGORY_SORT' | 'SEQUENCE_BUILD' | 'CONNECTION_WEB',
): Card {
  if (gameType === 'SEQUENCE_BUILD') {
    return {
      id,
      type: 'MINI_GAME',
      difficulty: 1,
      content: {
        gameType: 'SEQUENCE_BUILD',
        prompt: 'p',
        items: [{ id: 'i1', label: 'a', correctPosition: 0 }],
        explanation: 'e',
      },
    };
  }
  if (gameType === 'CONNECTION_WEB') {
    return {
      id,
      type: 'MINI_GAME',
      difficulty: 1,
      content: {
        gameType: 'CONNECTION_WEB',
        prompt: 'p',
        pairs: [{ id: 'p1', left: 'L', right: 'R' }],
        explanation: 'e',
      },
    };
  }
  return card(id, 'MINI_GAME');
}

describe('filterCardsByCardTypes', () => {
  it('returns empty array when enabledTypes is empty', () => {
    const cards = [card('a', 'FLASHCARD'), card('b', 'SINGLE_CHOICE')];
    expect(filterCardsByCardTypes(cards, new Set())).toEqual([]);
  });

  it('filters to a single card type', () => {
    const cards = [
      card('f1', 'FLASHCARD'),
      card('s1', 'SINGLE_CHOICE'),
      card('f2', 'FLASHCARD'),
    ];
    expect(filterCardsByCardTypes(cards, new Set(['FLASHCARD']))).toEqual([
      card('f1', 'FLASHCARD'),
      card('f2', 'FLASHCARD'),
    ]);
  });

  it('preserves relative order', () => {
    const cards = [
      card('1', 'MULTI_CHOICE'),
      card('2', 'FLASHCARD'),
      card('3', 'MULTI_CHOICE'),
    ];
    expect(filterCardsByCardTypes(cards, new Set(['MULTI_CHOICE']))).toEqual([
      card('1', 'MULTI_CHOICE'),
      card('3', 'MULTI_CHOICE'),
    ]);
  });

  it('includes all types when set contains all four', () => {
    const cards = [
      card('a', 'FLASHCARD'),
      card('b', 'SINGLE_CHOICE'),
      card('c', 'MULTI_CHOICE'),
      card('d', 'MINI_GAME'),
    ];
    const all = new Set<Card['type']>(['FLASHCARD', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'MINI_GAME']);
    expect(filterCardsByCardTypes(cards, all)).toEqual(cards);
  });
});

describe('filterCardsForStudy', () => {
  it('returns empty when both sets are empty', () => {
    const cards = [card('a', 'FLASHCARD'), miniGameCard('m', 'CATEGORY_SORT')];
    expect(filterCardsForStudy(cards, new Set(), new Set())).toEqual([]);
  });

  it('filters mini-games by gameType only', () => {
    const cards = [
      miniGameCard('c', 'CATEGORY_SORT'),
      miniGameCard('s', 'SEQUENCE_BUILD'),
      miniGameCard('w', 'CONNECTION_WEB'),
    ];
    expect(filterCardsForStudy(cards, new Set(), new Set(['SEQUENCE_BUILD']))).toEqual([
      miniGameCard('s', 'SEQUENCE_BUILD'),
    ]);
  });

  it('combines base types and mini-game kinds', () => {
    const cards = [
      card('f', 'FLASHCARD'),
      miniGameCard('c', 'CATEGORY_SORT'),
      miniGameCard('s', 'SEQUENCE_BUILD'),
    ];
    const out = filterCardsForStudy(cards, new Set(['FLASHCARD']), new Set(['CATEGORY_SORT']));
    expect(out.map((c) => c.id).sort()).toEqual(['c', 'f']);
  });

  it('excludes mini-games when mini set is empty', () => {
    const cards = [card('f', 'FLASHCARD'), miniGameCard('c', 'CATEGORY_SORT')];
    expect(filterCardsForStudy(cards, new Set(['FLASHCARD']), new Set())).toEqual([card('f', 'FLASHCARD')]);
  });
});
