/**
 * Helpers for integrating Crystal Trial with the progression store.
 *
 * These pure functions are called from within progressionStore XP update flows
 * to detect positive XP gains and level boundary crossings.
 */

import {
  CRYSTAL_XP_PER_LEVEL,
  calculateLevelFromXP,
} from '@/features/progression/progressionUtils';
import { MAX_CARD_DIFFICULTY } from './crystalTrialConfig';

/** Calculate the next target card difficulty for a given crystal level. */
export function getTrialCardDifficulty(crystalLevel: number): number {
  return Math.min(MAX_CARD_DIFFICULTY, crystalLevel + 1);
}

/** Check if XP increased by any amount. */
export function hasAddedAnyXp(
  previousXp: number,
  currentXp: number,
): boolean {
  return currentXp > previousXp;
}

/** Check if XP would cross a level boundary. */
export function wouldCrossLevelBoundary(
  currentXp: number,
  xpToAdd: number,
): { crosses: boolean; currentLevel: number; projectedLevel: number } {
  const projectedXp = currentXp + xpToAdd;
  const currentLevel = calculateLevelFromXP(currentXp);
  const projectedLevel = calculateLevelFromXP(projectedXp);
  return {
    crosses: projectedLevel > currentLevel,
    currentLevel,
    projectedLevel,
  };
}

/** Calculate how much XP to cap at (just below the next level threshold). */
export function capXpBelowThreshold(
  currentXp: number,
  currentLevel: number,
): { cappedXp: number; maxReward: number } {
  const thresholdXp = (currentLevel + 1) * CRYSTAL_XP_PER_LEVEL;
  const cappedXp = thresholdXp - 1;
  const maxReward = Math.max(0, cappedXp - currentXp);
  return { cappedXp, maxReward };
}

