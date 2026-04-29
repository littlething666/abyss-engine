import { describe, expect, it } from 'vitest';

import { migrateMentorState, DEFAULT_PERSISTED_STATE } from '../mentorStore';

describe('migrateMentorState (v5 scoped hard cut)', () => {
  it('returns DEFAULT_PERSISTED_STATE for null/undefined persisted input', () => {
    expect(migrateMentorState(null, 0)).toEqual(DEFAULT_PERSISTED_STATE);
    expect(migrateMentorState(undefined as unknown, 4)).toEqual(DEFAULT_PERSISTED_STATE);
  });

  it('returns DEFAULT_PERSISTED_STATE for non-object persisted input', () => {
    expect(migrateMentorState('not-an-object' as unknown, 4)).toEqual(DEFAULT_PERSISTED_STATE);
    expect(migrateMentorState(42 as unknown, 4)).toEqual(DEFAULT_PERSISTED_STATE);
    expect(migrateMentorState([] as unknown, 4)).toEqual(DEFAULT_PERSISTED_STATE);
  });

  it('drops legacy seenTriggers content unconditionally (hard cut)', () => {
    const persisted = {
      ...DEFAULT_PERSISTED_STATE,
      seenTriggers: ['onboarding.welcome', 'session.completed'],
    };
    const migrated = migrateMentorState(persisted, 4);
    expect(migrated.seenTriggers).toEqual([]);
  });

  it('drops legacy cooldowns content unconditionally (hard cut)', () => {
    const persisted = {
      ...DEFAULT_PERSISTED_STATE,
      cooldowns: {
        'crystal.leveled': 1,
        'session.completed': 2,
      },
    };
    const migrated = migrateMentorState(persisted, 4);
    expect(migrated.cooldowns).toEqual({});
  });

  it('preserves playerName from a prior version', () => {
    const migrated = migrateMentorState({ playerName: 'Sergio' }, 4);
    expect(migrated.playerName).toBe('Sergio');
    expect(migrated.seenTriggers).toEqual([]);
    expect(migrated.cooldowns).toEqual({});
  });

  it('preserves all non-trigger persisted fields across the bump', () => {
    const migrated = migrateMentorState(
      {
        playerName: 'Sergio',
        mentorLocale: 'en',
        narrationEnabled: true,
        lastInteractionAt: 1234567890,
        firstSubjectGenerationEnqueuedAt: 9876543210,
        seenTriggers: ['mentor.bubble.click'],
        cooldowns: { 'crystal.leveled': 42 },
      },
      4,
    );
    expect(migrated.playerName).toBe('Sergio');
    expect(migrated.mentorLocale).toBe('en');
    expect(migrated.narrationEnabled).toBe(true);
    expect(migrated.lastInteractionAt).toBe(1234567890);
    expect(migrated.firstSubjectGenerationEnqueuedAt).toBe(9876543210);
    expect(migrated.seenTriggers).toEqual([]);
    expect(migrated.cooldowns).toEqual({});
  });

  it('does not re-open the onboarding gate for users who already generated subjects', () => {
    // Regression guard for Cursor Bugbot finding: the
    // onboarding:pre-first-subject trigger gates on
    // firstSubjectGenerationEnqueuedAt === null. Migrating a user with a
    // non-null timestamp must preserve the timestamp so the onboarding
    // dialog does NOT re-open after the v4 -> v5 bump.
    const migrated = migrateMentorState(
      {
        firstSubjectGenerationEnqueuedAt: 1700000000000,
        seenTriggers: ['onboarding.subject_unlock_first_crystal'],
      },
      4,
    );
    expect(migrated.firstSubjectGenerationEnqueuedAt).toBe(1700000000000);
    expect(migrated.firstSubjectGenerationEnqueuedAt).not.toBeNull();
  });

  it('falls back to defaults per-field when types are wrong', () => {
    const migrated = migrateMentorState(
      {
        playerName: 42,
        narrationEnabled: 'yes',
        lastInteractionAt: 'now',
        firstSubjectGenerationEnqueuedAt: 'long ago',
        mentorLocale: 'fr',
      },
      4,
    );
    expect(migrated.playerName).toBeNull();
    expect(migrated.narrationEnabled).toBe(false);
    expect(migrated.lastInteractionAt).toBeNull();
    expect(migrated.firstSubjectGenerationEnqueuedAt).toBeNull();
    expect(migrated.mentorLocale).toBe('en');
  });
});
