import { describe, it, expect } from 'vitest';

import {
  hasAddedAnyXp,
  wouldCrossLevelBoundary,
  capXpBelowThreshold,
  getTrialCardDifficulty,
} from './progressionIntegration';

describe('hasAddedAnyXp', () => {
  it('returns true when XP increases', () => {
    expect(hasAddedAnyXp(45, 55)).toBe(true);
  });

  it('returns false when XP is unchanged', () => {
    expect(hasAddedAnyXp(55, 55)).toBe(false);
  });

  it('returns false when XP decreases', () => {
    expect(hasAddedAnyXp(55, 40)).toBe(false);
  });

});

describe('wouldCrossLevelBoundary', () => {
  it('detects boundary crossing', () => {
    const result = wouldCrossLevelBoundary(95, 10);
    expect(result.crosses).toBe(true);
    expect(result.currentLevel).toBe(0);
    expect(result.projectedLevel).toBe(1);
  });

  it('returns false when staying within level', () => {
    const result = wouldCrossLevelBoundary(50, 10);
    expect(result.crosses).toBe(false);
  });
});

describe('capXpBelowThreshold', () => {
  it('caps XP at threshold - 1', () => {
    const result = capXpBelowThreshold(90, 0);
    expect(result.cappedXp).toBe(99);
    expect(result.maxReward).toBe(9);
  });

  it('returns 0 reward when already at cap', () => {
    const result = capXpBelowThreshold(99, 0);
    expect(result.cappedXp).toBe(99);
    expect(result.maxReward).toBe(0);
  });
});

describe('getTrialCardDifficulty', () => {
  it('returns crystalLevel + 1 for normal levels', () => {
    expect(getTrialCardDifficulty(0)).toBe(1);
    expect(getTrialCardDifficulty(1)).toBe(2);
    expect(getTrialCardDifficulty(2)).toBe(3);
    expect(getTrialCardDifficulty(3)).toBe(4);
  });

  it('caps at MAX_CARD_DIFFICULTY for L4', () => {
    expect(getTrialCardDifficulty(4)).toBe(4);
  });

  it('caps at MAX_CARD_DIFFICULTY for L5', () => {
    expect(getTrialCardDifficulty(5)).toBe(4);
  });
});
