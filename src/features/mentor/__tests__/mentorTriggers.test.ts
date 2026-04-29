import { describe, expect, it } from 'vitest';

import { MENTOR_TRIGGER_IDS } from '../mentorTypes';

describe('MENTOR_TRIGGER_IDS', () => {
  it('contains exactly the v1 canonical triggers (post-onboarding-collapse)', () => {
    expect([...MENTOR_TRIGGER_IDS].sort()).toEqual(
      [
        'crystal.leveled',
        'crystal.trial.awaiting',
        'mentor.bubble.click',
        'onboarding.pre_first_subject',
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
});
