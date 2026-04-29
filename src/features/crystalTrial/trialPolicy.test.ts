import { describe, expect, it } from 'vitest';

import type { CrystalTrialStatus } from '@/types/crystalTrial';
import { CRYSTAL_XP_PER_LEVEL } from '@/features/progression/progressionUtils';
import {
  busMayStartTrialPregeneration,
  isCrystalTrialAvailableForPlayer,
  isCrystalTrialPrepared,
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

const NON_PREPARED_STATUSES: CrystalTrialStatus[] = [
  'idle',
  'pregeneration',
  'in_progress',
  'passed',
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

describe('isCrystalTrialPrepared', () => {
  it('is true only for awaiting_player', () => {
    expect(isCrystalTrialPrepared('awaiting_player')).toBe(true);
    for (const s of NON_PREPARED_STATUSES) {
      expect(isCrystalTrialPrepared(s)).toBe(false);
    }
  });
});

describe('isCrystalTrialAvailableForPlayer', () => {
  // "Maxed for current level" means XP at the band cap, e.g. 99 for level 0.
  const BAND_CAP_XP = CRYSTAL_XP_PER_LEVEL - 1;
  const BELOW_CAP_XP = 0;

  it('is true when prepared AND xp is at the band cap', () => {
    expect(isCrystalTrialAvailableForPlayer('awaiting_player', BAND_CAP_XP)).toBe(true);
  });

  it('is false when prepared but xp has not reached the cap', () => {
    expect(isCrystalTrialAvailableForPlayer('awaiting_player', BELOW_CAP_XP)).toBe(false);
  });

  it('is false when xp is at the cap but the trial is not prepared', () => {
    for (const s of NON_PREPARED_STATUSES) {
      expect(isCrystalTrialAvailableForPlayer(s, BAND_CAP_XP)).toBe(false);
    }
  });
});
