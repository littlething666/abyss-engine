import { describe, it, expect } from 'vitest';
import { ratingToTier, choiceResultToTier } from '../useRatingFeedback';

describe('useRatingFeedback helpers', () => {
  describe('ratingToTier', () => {
    it('maps rating 1 to tier 1', () => expect(ratingToTier(1)).toBe(1));
    it('maps rating 2 to tier 2', () => expect(ratingToTier(2)).toBe(2));
    it('maps rating 3 to tier 3', () => expect(ratingToTier(3)).toBe(3));
    it('maps rating 4 to tier 4', () => expect(ratingToTier(4)).toBe(4));
  });

  describe('choiceResultToTier', () => {
    it('maps correct answer to tier 3 (Good)', () => {
      expect(choiceResultToTier(true)).toBe(3);
    });

    it('maps incorrect answer to tier 1 (Forgot)', () => {
      expect(choiceResultToTier(false)).toBe(1);
    });
  });
});
