import type { CrystalTrialStatus } from '@/types/crystalTrial';

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
