/**
 * Unit Tests for sm2.ts - Abyss Engine
 *
 * Tests the simplified SM-2 spaced repetition algorithm functions
 */

import { describe, it, expect } from 'vitest';
import {
  calculateNextReview,
  calculateNextReviewForCard,
  getDueCards,
  SM2Data,
} from './sm2';
import { Rating } from '../../types';

// Helper to create a mock card review state
type MockCardWithSM2 = {
  id: string;
  sm2: SM2Data;
};

// Helper to create a mock card state
function createMockCard(overrides: Partial<MockCardWithSM2> = {}): MockCardWithSM2 {
  return {
    id: 'test-card',
    sm2: {
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReview: Date.now(),
    },
    ...overrides,
  };
}

// Helper to create a card with specific SM2 values
function createCardWithSM2(
  sm2Values: {
    interval?: number;
    easeFactor?: number;
    repetitions?: number;
    nextReview?: number;
  } = {},
  overrides: Partial<MockCardWithSM2> = {}
): MockCardWithSM2 {
  return createMockCard({
    sm2: {
      interval: sm2Values.interval ?? 0,
      easeFactor: sm2Values.easeFactor ?? 2.5,
      repetitions: sm2Values.repetitions ?? 0,
      nextReview: sm2Values.nextReview ?? Date.now(),
    },
    ...overrides,
  });
}

describe('calculateNextReview', () => {
  it('should reset interval and repetitions on rating 1 (Again)', () => {
    const card = createCardWithSM2({
      interval: 10,
      easeFactor: 2.5,
      repetitions: 5,
    });

    const result = calculateNextReview(card, 1 as Rating);

    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(0);
  });

  it('should reset interval and repetitions on rating 2 (Hard)', () => {
    const card = createCardWithSM2({
      interval: 10,
      easeFactor: 2.5,
      repetitions: 5,
    });

    const result = calculateNextReview(card, 2 as Rating);

    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(0);
  });

  it('should set interval to 1 on first successful review (rating 3)', () => {
    const card = createCardWithSM2({
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
    });

    const result = calculateNextReview(card, 3 as Rating);

    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it('should set interval to 6 on second successful review (rating 3)', () => {
    const card = createCardWithSM2({
      interval: 1,
      easeFactor: 2.5,
      repetitions: 1,
    });

    const result = calculateNextReview(card, 3 as Rating);

    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it('should multiply interval by ease on subsequent reviews (rating 3)', () => {
    const card = createCardWithSM2({
      interval: 6,
      easeFactor: 2.5,
      repetitions: 2,
    });

    const result = calculateNextReview(card, 3 as Rating);

    expect(result.interval).toBe(15); // 6 * 2.5 = 15
    expect(result.repetitions).toBe(3);
  });

  it('should add 2 repetitions on rating 4 (Easy) instead of 1', () => {
    const card = createCardWithSM2({
      interval: 6,
      easeFactor: 2.5,
      repetitions: 2,
    });

    const result = calculateNextReview(card, 4 as Rating);

    // Rating 4 increases ease (q=5): newEase = 2.5 + 0.1 = 2.6
    // interval = round(6 * 2.6) = 16
    expect(result.interval).toBe(16);
    expect(result.repetitions).toBe(4); // 2 + 2 = 4
  });

  it('should not let ease go below minimum (1.3)', () => {
    const card = createCardWithSM2({
      interval: 0,
      easeFactor: 1.3, // Already at minimum
      repetitions: 0,
    });

    const result = calculateNextReview(card, 2 as Rating);

    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('should generate valid nextReview', () => {
    const card = createCardWithSM2({
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
    });

    const result = calculateNextReview(card, 3 as Rating);

    expect(result.nextReview).toBeDefined();
    expect(result.nextReview).toBeGreaterThan(Date.now());
  });
});

describe('calculateNextReviewForCard', () => {
  it('should be an alias for calculateNextReview', () => {
    const card = createCardWithSM2({
      interval: 6,
      easeFactor: 2.5,
      repetitions: 2,
    });

    const result1 = calculateNextReview(card, 3 as Rating);
    const result2 = calculateNextReviewForCard(card, 3 as Rating);

    expect(result1).toEqual(result2);
  });
});

describe('getDueCards', () => {
  it('should return empty array when no cards are due', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const cards: MockCardWithSM2[] = [
      createCardWithSM2(
        { repetitions: 1, nextReview: tomorrow.getTime() },
        { id: 'not-due' }
      ),
    ];

    expect(getDueCards(cards)).toHaveLength(0);
  });

  it('should return only due cards', () => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const cards: MockCardWithSM2[] = [
      createCardWithSM2(
        { repetitions: 0, nextReview: today.getTime() },
        { id: 'due' }
      ),
      createCardWithSM2(
        { repetitions: 1, nextReview: tomorrow.getTime() },
        { id: 'not-due' }
      ),
    ];

    const result = getDueCards(cards);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('due');
  });

  it('should return true for card due today', () => {
    const sm2Data: SM2Data = {
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReview: Date.now(),
    };

    // Card due today should be included
    const card = createMockCard({
      sm2: sm2Data,
    });

    expect(getDueCards([card])).toHaveLength(1);
  });

  it('should return true for overdue card', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const card = createCardWithSM2({
      interval: 1,
      easeFactor: 2.5,
      repetitions: 1,
      nextReview: yesterday.getTime(),
    });

    expect(getDueCards([card])).toHaveLength(1);
  });

  it('should return false for future due date', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const card = createCardWithSM2({
      interval: 1,
      easeFactor: 2.5,
      repetitions: 1,
      nextReview: tomorrow.getTime(),
    });

    expect(getDueCards([card])).toHaveLength(0);
  });
});
