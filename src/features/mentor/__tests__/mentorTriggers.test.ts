import { describe, expect, it } from 'vitest';

import { MENTOR_TRIGGER_IDS } from '../mentorTypes';

describe('MENTOR_TRIGGER_IDS', () => {
  it('contains exactly the canonical colon-namespace triggers (Phase A inclusive)', () => {
    expect([...MENTOR_TRIGGER_IDS].sort()).toEqual(
      [
        'content-generation:retry-failed',
        'crystal-trial:available-for-player',
        'crystal-trial:generation-failed',
        'crystal:leveled',
        'mentor-bubble:clicked',
        'onboarding:pre-first-subject',
        'onboarding:subject-unlock-first-crystal',
        'session:completed',
        'subject:generated',
        'subject:generation-failed',
        'subject:generation-started',
        'topic-content:generation-failed',
        'topic-content:generation-ready',
        'topic-expansion:generation-failed',
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
