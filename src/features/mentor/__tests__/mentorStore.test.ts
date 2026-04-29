import { describe, expect, it } from 'vitest';

import { migrateMentorState, DEFAULT_PERSISTED_STATE } from '../mentorStore';

describe('migrateMentorState', () => {
  it('drops retired onboarding ids from seenTriggers on v2 -> v3', () => {
    const persisted = {
      ...DEFAULT_PERSISTED_STATE,
      seenTriggers: ['onboarding.welcome', 'session.completed', 'onboarding.first_subject'],
    };
    const migrated = migrateMentorState(persisted, 2);
    expect(migrated.seenTriggers).toEqual(['session.completed']);
  });

  it('drops retired onboarding ids from cooldowns on v2 -> v3', () => {
    const persisted = {
      ...DEFAULT_PERSISTED_STATE,
      cooldowns: {
        'onboarding.welcome': 1,
        'onboarding.first_subject': 2,
        'session.completed': 3,
      },
    };
    const migrated = migrateMentorState(persisted, 2);
    expect(migrated.cooldowns).toEqual({ 'session.completed': 3 });
  });

  it('preserves valid persisted fields across the migration', () => {
    const persisted = {
      ...DEFAULT_PERSISTED_STATE,
      playerName: 'Sergio',
      narrationEnabled: false,
      firstSubjectGenerationEnqueuedAt: 1000,
    };
    const migrated = migrateMentorState(persisted, 2);
    expect(migrated.playerName).toBe('Sergio');
    expect(migrated.narrationEnabled).toBe(false);
    expect(migrated.firstSubjectGenerationEnqueuedAt).toBe(1000);
  });

  it('still handles v0/v1 ttsMuted -> narrationEnabled', () => {
    const migrated = migrateMentorState({ ttsMuted: true } as unknown, 0);
    expect(migrated.narrationEnabled).toBe(false);
  });
});
