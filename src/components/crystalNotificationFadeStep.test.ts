import { describe, expect, it } from 'vitest';

import {
  CRYSTAL_NOTIFICATION_FADE_FULL_TRANSITION_S,
  stepCrystalNotificationFadeOpacity,
} from './crystalNotificationFadeStep';

describe('stepCrystalNotificationFadeOpacity', () => {
  it('reaches full opacity in one transition window from zero', () => {
    let o = 0;
    o = stepCrystalNotificationFadeOpacity(o, true, CRYSTAL_NOTIFICATION_FADE_FULL_TRANSITION_S);
    expect(o).toBe(1);
  });

  it('reaches zero opacity in one transition window from one', () => {
    let o = 1;
    o = stepCrystalNotificationFadeOpacity(o, false, CRYSTAL_NOTIFICATION_FADE_FULL_TRANSITION_S);
    expect(o).toBe(0);
  });

  it('ramps linearly over two half-duration steps', () => {
    const half = CRYSTAL_NOTIFICATION_FADE_FULL_TRANSITION_S / 2;
    let o = 0;
    o = stepCrystalNotificationFadeOpacity(o, true, half);
    expect(o).toBeCloseTo(0.5, 5);
    o = stepCrystalNotificationFadeOpacity(o, true, half);
    expect(o).toBe(1);
  });
});
