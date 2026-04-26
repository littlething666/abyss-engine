import type { CoarseRatingInputs, CoarseRatingResult } from '@/types';

export function computeFastThresholdMs(difficulty: number): number {
  return Math.max(5_000, 2_500 * Math.max(1, difficulty));
}

export function computeSlowThresholdMs(difficulty: number): number {
  return Math.max(10_000, 5_000 * Math.max(1, difficulty));
}

export function resolveCoarseRating(input: CoarseRatingInputs): CoarseRatingResult {
  const { coarse, timeTakenMs, hintUsed, difficulty } = input;

  if (coarse === 'forgot') {
    return { rating: 1, appliedBucket: 'forgot' };
  }

  if (hintUsed) {
    return { rating: 2, appliedBucket: 'slow' };
  }

  const fastThresholdMs = computeFastThresholdMs(difficulty);
  const slowThresholdMs = computeSlowThresholdMs(difficulty);

  if (timeTakenMs <= fastThresholdMs) {
    return { rating: 4, appliedBucket: 'fast' };
  }

  if (timeTakenMs >= slowThresholdMs) {
    return { rating: 2, appliedBucket: 'slow' };
  }

  return { rating: 3, appliedBucket: 'normal' };
}
