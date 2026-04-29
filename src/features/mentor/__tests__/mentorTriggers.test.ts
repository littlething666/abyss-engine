import { describe, expect, it } from 'vitest';

import { MENTOR_TRIGGER_IDS } from '../mentorTypes';

describe('MENTOR_TRIGGER_IDS', () => {
  it('contains exactly the v1 canonical triggers (post-onboarding-collapse + trial rename + subject-unlock-first-crystal)', () => {
    expect([...MENTOR_TRIGGER_IDS].sort()).toEqual(
      [
        'crystal.leveled',
        'crystal.trial.available_for_player',
        'mentor.bubble.click',
        'onboarding.pre_first_subject',
        'onboarding.subject_unlock_first_crystal',
        'session.completed',
        'subject.generated',
        'subject.generation.failed',
        'subject.generation.started',
      ].sort(),
    );
  });

  it('no longer includes the retired onboarding ids', () => {
    expect(MENTOR_TRIGGER_IDS).not.toContain('onboarding.welcome');
    expect(MENTOR_TRIGGER_IDS).not.toContain('onboarding.first_subject');
  });

  it('no longer includes the retired raw-status trial trigger', () => {
    // Renamed to `crystal.trial.available_for_player` so the trigger
    // expresses the player-facing predicate (status awaiting_player AND
    // XP at band cap), not the raw store status.
    expect(MENTOR_TRIGGER_IDS).not.toContain('crystal.trial.awaiting');
  });
});
