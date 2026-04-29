import type { CrystalTrialStatus } from '@/types/crystalTrial';
import { isXpMaxedForCurrentLevel } from '@/features/progression/progressionUtils';

const XP_CAP_AT_LEVEL_BOUNDARY_STATUSES = new Set<CrystalTrialStatus>([
  'idle',
  'pregeneration',
  'awaiting_player',
  'in_progress',
  'failed',
  'cooldown',
]);

/** Trial states where XP that would cross the next level boundary is capped (not `passed` or `idle`). */
export function trialStatusRequiresXpCapAtLevelBoundary(status: CrystalTrialStatus): boolean {
  return XP_CAP_AT_LEVEL_BOUNDARY_STATUSES.has(status);
}

/**
 * `crystal:trial-pregenerate` may start work only from a clean slate — never auto-retry from `failed`.
 */
export function busMayStartTrialPregeneration(status: CrystalTrialStatus): boolean {
  return status === 'idle';
}

/**
 * Trial preparation predicate. True when trial questions have been generated
 * and stored, but player-facing availability is still gated on XP.
 *
 * The internal store status `awaiting_player` is the implementation detail
 * for "questions prepared"; UI copy and mentor prompts must distinguish
 * this from {@link isCrystalTrialAvailableForPlayer}.
 */
export function isCrystalTrialPrepared(status: CrystalTrialStatus): boolean {
  return status === 'awaiting_player';
}

/**
 * Player-facing trial availability. True iff the trial is prepared AND the
 * crystal is XP-capped at its current level boundary.
 *
 * Source of truth for:
 *   - "Begin Trial" button enablement
 *   - the `crystal.trial.available_for_player` mentor trigger
 *   - the trial pulse VFX gating in `Crystals.tsx`
 */
export function isCrystalTrialAvailableForPlayer(
  status: CrystalTrialStatus,
  xp: number,
): boolean {
  return isCrystalTrialPrepared(status) && isXpMaxedForCurrentLevel(xp);
}
