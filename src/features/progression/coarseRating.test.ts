import { describe, expect, it } from 'vitest';

import { CoarseChoice } from '../../types';
import {
  computeFastThresholdMs,
  computeSlowThresholdMs,
  resolveCoarseRating,
} from './coarseRating';

describe('coarse rating thresholds', () => {
  it('applies minimum bounds for difficulty one', () => {
    expect(computeFastThresholdMs(1)).toBe(5000);
    expect(computeSlowThresholdMs(1)).toBe(10000);
  });

  it('scales thresholds with card difficulty', () => {
    expect(computeFastThresholdMs(4)).toBe(10000);
    expect(computeSlowThresholdMs(4)).toBe(20000);
  });
});

describe('resolveCoarseRating', () => {
  const base = (coarse: CoarseChoice, timeTakenMs: number, hintUsed = false, difficulty = 1) =>
    resolveCoarseRating({ coarse, timeTakenMs, hintUsed, difficulty });

  it('maps forgot choice to a hard 1 and forgot bucket', () => {
    expect(base('forgot', 30000)).toEqual({ rating: 1, appliedBucket: 'forgot' });
  });

  it('maps recalled with hint used to a slow 2', () => {
    expect(base('recalled', 0, true)).toEqual({ rating: 2, appliedBucket: 'slow' });
  });

  it('maps fast recall to a 4 fast', () => {
    expect(base('recalled', 5000)).toEqual({ rating: 4, appliedBucket: 'fast' });
  });

  it('maps normal recall to a 3 normal', () => {
    expect(base('recalled', 7000)).toEqual({ rating: 3, appliedBucket: 'normal' });
  });

  it('maps slow recall to a 2 slow', () => {
    expect(base('recalled', 10_000)).toEqual({ rating: 2, appliedBucket: 'slow' });
  });

  it('uses difficulty to tune speed/slow boundaries', () => {
    expect(base('recalled', 9_000, false, 4)).toEqual({ rating: 4, appliedBucket: 'fast' });
    expect(base('recalled', 15_000, false, 4)).toEqual({ rating: 3, appliedBucket: 'normal' });
    expect(base('recalled', 20_000, false, 4)).toEqual({ rating: 2, appliedBucket: 'slow' });
  });
});
