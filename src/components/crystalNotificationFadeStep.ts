/** Wall-clock duration to traverse the full 0→1 or 1→0 opacity range (linear). */
export const CRYSTAL_NOTIFICATION_FADE_FULL_TRANSITION_S = 0.3;

/**
 * Linear fade toward 1 when `active`, toward 0 when inactive.
 * Full opacity swing completes in {@link CRYSTAL_NOTIFICATION_FADE_FULL_TRANSITION_S}.
 */
export function stepCrystalNotificationFadeOpacity(
  current: number,
  active: boolean,
  deltaSeconds: number,
  fullTransitionSeconds: number = CRYSTAL_NOTIFICATION_FADE_FULL_TRANSITION_S,
): number {
  const speed = 1 / fullTransitionSeconds;
  if (active) {
    if (current >= 1) {
      return 1;
    }
    return Math.min(1, current + speed * deltaSeconds);
  }
  if (current <= 0) {
    return 0;
  }
  return Math.max(0, current - speed * deltaSeconds);
}
