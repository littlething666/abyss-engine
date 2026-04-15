import { describe, expect, it } from 'vitest';

import type { CrystalTrialStatus } from '@/types/crystalTrial';
import {
  busMayStartTrialPregeneration,
  trialStatusRequiresXpCapAtLevelBoundary,
} from './trialPolicy';

const CAP_STATUSES: CrystalTrialStatus[] = [
  'idle',
  'pregeneration',
  'awaiting_player',
  'in_progress',
  'failed',
  'cooldown',
];

describe('trialStatusRequiresXpCapAtLevelBoundary', () => {
  it('returns true for every gated trial status', () => {
    for (const status of CAP_STATUSES) {
      expect(trialStatusRequiresXpCapAtLevelBoundary(status)).toBe(true);
    }
  });

  it('returns false for passed (level-up allowed)', () => {
    expect(trialStatusRequiresXpCapAtLevelBoundary('passed')).toBe(false);
  });
});

describe('busMayStartTrialPregeneration', () => {
  it('allows only idle', () => {
    expect(busMayStartTrialPregeneration('idle')).toBe(true);
    expect(busMayStartTrialPregeneration('failed')).toBe(false);
    expect(busMayStartTrialPregeneration('pregeneration')).toBe(false);
  });
});
