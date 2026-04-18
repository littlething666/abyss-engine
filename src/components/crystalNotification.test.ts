import { describe, expect, it } from 'vitest';

import { resolveCrystalNotificationFlags } from './crystalNotification';

describe('resolveCrystalNotificationFlags', () => {
  it('prefers generating over trial and celebration', () => {
    const r = resolveCrystalNotificationFlags({
      isContentGenerating: true,
      isTrialPregenerating: true,
      isCelebrationPending: true,
    });
    expect(r?.kind).toBe('generating');
    expect(r?.rotationMode).toBe('hourglass');
  });

  it('prefers trial pregeneration over celebration', () => {
    const r = resolveCrystalNotificationFlags({
      isContentGenerating: false,
      isTrialPregenerating: true,
      isCelebrationPending: true,
    });
    expect(r?.kind).toBe('trial_pregeneration');
    expect(r?.rotationMode).toBe('trial_gear');
  });

  it('shows celebration when higher priorities are absent', () => {
    const r = resolveCrystalNotificationFlags({
      isContentGenerating: false,
      isTrialPregenerating: false,
      isCelebrationPending: true,
    });
    expect(r?.kind).toBe('celebration');
    expect(r?.rotationMode).toBe('none');
  });

  it('returns null when nothing applies', () => {
    expect(
      resolveCrystalNotificationFlags({
        isContentGenerating: false,
        isTrialPregenerating: false,
        isCelebrationPending: false,
      }),
    ).toBeNull();
  });
});
