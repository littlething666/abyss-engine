import { appEventBus } from '@/infrastructure/eventBus';
import {
  calculateLevelFromXP,
  MAX_CRYSTAL_LEVEL,
} from '@/features/progression/progressionUtils';
import type { ActiveCrystal, TopicRef } from '@/types/core';

/**
 * Resolves current/target trial levels for a topic from active crystals, or null if
 * there is no crystal or the crystal is at max level.
 */
export function resolveCrystalTrialPregenerateLevels(
  ref: TopicRef,
  activeCrystals: readonly ActiveCrystal[],
): { currentLevel: number; targetLevel: number } | null {
  const crystal = activeCrystals.find(
    (c) => c.subjectId === ref.subjectId && c.topicId === ref.topicId,
  );
  if (!crystal) {
    return null;
  }
  const currentLevel = calculateLevelFromXP(crystal.xp);
  if (currentLevel >= MAX_CRYSTAL_LEVEL) {
    return null;
  }
  return { currentLevel, targetLevel: currentLevel + 1 };
}

/**
 * Emits `crystal:trial-pregenerate` for a topic when the learner has a crystal and is
 * below max level. Used after trials are invalidated (e.g. card pool changed), on XP
 * gating when starting from `idle`, and when adding positive XP.
 */
export function emitCrystalTrialPregenerateForTopic(
  ref: TopicRef,
  activeCrystals: readonly ActiveCrystal[],
): void {
  const levels = resolveCrystalTrialPregenerateLevels(ref, activeCrystals);
  if (!levels) {
    return;
  }
  appEventBus.emit('crystal:trial-pregenerate', {
    subjectId: ref.subjectId,
    topicId: ref.topicId,
    currentLevel: levels.currentLevel,
    targetLevel: levels.targetLevel,
  });
}
