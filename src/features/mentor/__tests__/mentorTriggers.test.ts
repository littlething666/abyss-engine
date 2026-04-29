import { describe, expect, it } from 'vitest';

import { MENTOR_TRIGGER_IDS } from '../mentorTypes';

describe('MENTOR_TRIGGER_IDS', () => {
  it('contains exactly the v1 canonical colon-namespace triggers', () => {
    expect([...MENTOR_TRIGGER_IDS].sort()).toEqual(
      [
        'crystal-trial:available-for-player',
        'crystal:leveled',
        'mentor-bubble:clicked',
        'onboarding:pre-first-subject',
        'onboarding:subject-unlock-first-crystal',
        'session:completed',
        'subject:generated',
        'subject:generation-failed',
        'subject:generation-started',
      ].sort(),
    );
  });

  it('no longer includes legacy dot-namespace ids', () => {
    const ids = MENTOR_TRIGGER_IDS as readonly string[];
    expect(ids).not.toContain('onboarding.welcome');
    expect(ids).not.toContain('onboarding.first_subject');
    expect(ids).not.toContain('onboarding.pre_first_subject');
    expect(ids).not.toContain('onboarding.subject_unlock_first_crystal');
    expect(ids).not.toContain('crystal.trial.awaiting');
    expect(ids).not.toContain('crystal.trial.available_for_player');
    expect(ids).not.toContain('crystal.leveled');
    expect(ids).not.toContain('session.completed');
    expect(ids).not.toContain('subject.generated');
    expect(ids).not.toContain('subject.generation.started');
    expect(ids).not.toContain('subject.generation.failed');
    expect(ids).not.toContain('mentor.bubble.click');
  });
});
