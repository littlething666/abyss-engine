import { describe, it, expect } from 'vitest';

import type { CategorySortContent, SequenceBuildContent, ConnectionWebContent } from '../../types/core';
import { evaluateMiniGame, miniGameResultToIsCorrect } from './evaluateMiniGame';

function createCategorySortContent(itemCount = 10): CategorySortContent {
  const categories = [
    { id: 'cat-supervised', label: 'Supervised' },
    { id: 'cat-unsupervised', label: 'Unsupervised' },
  ];
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: `item-${i}`,
    label: `Item ${i}`,
    categoryId: i % 2 === 0 ? 'cat-supervised' : 'cat-unsupervised',
  }));
  return {
    gameType: 'CATEGORY_SORT',
    prompt: 'Sort these ML algorithms',
    categories,
    items,
    explanation: 'Even items are supervised, odd are unsupervised.',
  };
}

function createSequenceBuildContent(): SequenceBuildContent {
  return {
    gameType: 'SEQUENCE_BUILD',
    prompt: 'Order these steps',
    items: [
      { id: 'step-0', label: 'Step A', correctPosition: 0 },
      { id: 'step-1', label: 'Step B', correctPosition: 1 },
      { id: 'step-2', label: 'Step C', correctPosition: 2 },
      { id: 'step-3', label: 'Step D', correctPosition: 3 },
      { id: 'step-4', label: 'Step E', correctPosition: 4 },
    ],
    explanation: 'Alphabetical order.',
  };
}

function createConnectionWebContent(): ConnectionWebContent {
  return {
    gameType: 'CONNECTION_WEB',
    prompt: 'Match left to right',
    pairs: [
      { id: 'p1', left: 'A', right: '1' },
      { id: 'p2', left: 'B', right: '2' },
      { id: 'p3', left: 'C', right: '3' },
      { id: 'p4', left: 'D', right: '4' },
      { id: 'p5', left: 'E', right: '5' },
    ],
    explanation: 'Letter to number.',
  };
}

describe('evaluateMiniGame — Category Sort', () => {
  it('returns score 1.0 when all items correctly categorized', () => {
    const content = createCategorySortContent(10);
    const placements = new Map<string, string>();
    for (const item of content.items) {
      placements.set(item.id, item.categoryId);
    }

    const result = evaluateMiniGame(content, placements);
    expect(result.score).toBe(1);
    expect(result.correctItems).toBe(10);
    expect(result.totalItems).toBe(10);
    expect(result.isCorrect).toBe(true);
  });

  it('returns score 0.0 when all items incorrectly categorized', () => {
    const content = createCategorySortContent(10);
    const placements = new Map<string, string>();
    for (const item of content.items) {
      const wrongCategory = item.categoryId === 'cat-supervised' ? 'cat-unsupervised' : 'cat-supervised';
      placements.set(item.id, wrongCategory);
    }

    const result = evaluateMiniGame(content, placements);
    expect(result.score).toBe(0);
    expect(result.correctItems).toBe(0);
    expect(result.isCorrect).toBe(false);
  });

  it('returns isCorrect=true when score >= 0.8 (8/10 correct)', () => {
    const content = createCategorySortContent(10);
    const placements = new Map<string, string>();
    content.items.forEach((item, i) => {
      if (i < 8) {
        placements.set(item.id, item.categoryId);
      } else {
        const wrong = item.categoryId === 'cat-supervised' ? 'cat-unsupervised' : 'cat-supervised';
        placements.set(item.id, wrong);
      }
    });

    const result = evaluateMiniGame(content, placements);
    expect(result.score).toBe(0.8);
    expect(result.isCorrect).toBe(true);
  });

  it('returns isCorrect=false when score < 0.8 (7/10 correct)', () => {
    const content = createCategorySortContent(10);
    const placements = new Map<string, string>();
    content.items.forEach((item, i) => {
      if (i < 7) {
        placements.set(item.id, item.categoryId);
      } else {
        const wrong = item.categoryId === 'cat-supervised' ? 'cat-unsupervised' : 'cat-supervised';
        placements.set(item.id, wrong);
      }
    });

    const result = evaluateMiniGame(content, placements);
    expect(result.score).toBe(0.7);
    expect(result.isCorrect).toBe(false);
  });

  it('handles missing placements (unplaced items count as incorrect)', () => {
    const content = createCategorySortContent(10);
    const placements = new Map<string, string>();
    placements.set(content.items[0].id, content.items[0].categoryId);

    const result = evaluateMiniGame(content, placements);
    expect(result.correctItems).toBe(1);
    expect(result.totalItems).toBe(10);
    expect(result.isCorrect).toBe(false);
  });

  it('handles empty items array', () => {
    const content = createCategorySortContent(0);
    const placements = new Map<string, string>();

    const result = evaluateMiniGame(content, placements);
    expect(result.score).toBe(0);
    expect(result.totalItems).toBe(0);
    expect(result.isCorrect).toBe(false);
  });

  it('marks per-item correctness accurately', () => {
    const content = createCategorySortContent(4);
    const placements = new Map<string, string>();
    content.items.forEach((item, i) => {
      if (i < 2) {
        placements.set(item.id, item.categoryId);
      } else {
        const wrong = item.categoryId === 'cat-supervised' ? 'cat-unsupervised' : 'cat-supervised';
        placements.set(item.id, wrong);
      }
    });

    const result = evaluateMiniGame(content, placements);
    expect(result.placements[0].isItemCorrect).toBe(true);
    expect(result.placements[1].isItemCorrect).toBe(true);
    expect(result.placements[2].isItemCorrect).toBe(false);
    expect(result.placements[3].isItemCorrect).toBe(false);
  });
});

describe('evaluateMiniGame — Sequence Build', () => {
  it('returns score 1.0 when all items correctly positioned', () => {
    const content = createSequenceBuildContent();
    const placements = new Map<string, string>();
    for (const item of content.items) {
      placements.set(item.id, String(item.correctPosition));
    }

    const result = evaluateMiniGame(content, placements);
    expect(result.score).toBe(1);
    expect(result.isCorrect).toBe(true);
  });

  it('returns isCorrect=false when positions are scrambled', () => {
    const content = createSequenceBuildContent();
    const placements = new Map<string, string>();
    for (const item of content.items) {
      placements.set(item.id, String((item.correctPosition + 1) % content.items.length));
    }

    const result = evaluateMiniGame(content, placements);
    expect(result.score).toBe(0);
    expect(result.isCorrect).toBe(false);
  });
});

describe('evaluateMiniGame — Connection Web', () => {
  it('returns score 1.0 when all pairs correctly matched', () => {
    const content = createConnectionWebContent();
    const placements = new Map<string, string>();
    for (const pair of content.pairs) {
      placements.set(pair.left, pair.right);
    }

    const result = evaluateMiniGame(content, placements);
    expect(result.score).toBe(1);
    expect(result.isCorrect).toBe(true);
  });

  it('returns isCorrect=false when pairs are mismatched', () => {
    const content = createConnectionWebContent();
    const placements = new Map<string, string>();
    for (const pair of content.pairs) {
      placements.set(pair.left, 'wrong');
    }

    const result = evaluateMiniGame(content, placements);
    expect(result.score).toBe(0);
    expect(result.isCorrect).toBe(false);
  });
});

describe('miniGameResultToIsCorrect', () => {
  it('returns true for score >= 0.8', () => {
    expect(miniGameResultToIsCorrect({ score: 0.8, totalItems: 10, correctItems: 8, isCorrect: true, placements: [] })).toBe(true);
    expect(miniGameResultToIsCorrect({ score: 1.0, totalItems: 10, correctItems: 10, isCorrect: true, placements: [] })).toBe(true);
  });

  it('returns false for score < 0.8', () => {
    expect(miniGameResultToIsCorrect({ score: 0.79, totalItems: 10, correctItems: 7, isCorrect: false, placements: [] })).toBe(false);
    expect(miniGameResultToIsCorrect({ score: 0, totalItems: 10, correctItems: 0, isCorrect: false, placements: [] })).toBe(false);
  });
});
