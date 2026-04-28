import { beforeEach, describe, expect, it } from 'vitest';

import type { DialogPlan, MentorTriggerId } from '../mentorTypes';
import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  migrateMentorState,
  useMentorStore,
} from '../mentorStore';

function plan(
  trigger: MentorTriggerId,
  priority: number,
  enqueuedAt: number,
): DialogPlan {
  return {
    id: `${trigger}-${enqueuedAt}`,
    trigger,
    priority,
    enqueuedAt,
    messages: [{ id: 'msg', text: 'hi' }],
    source: 'canned',
    voiceId: 'witty-sarcastic',
  };
}

beforeEach(() => {
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
});

describe('mentorStore', () => {
  it('enqueues plans stable-sorted by (priority desc, enqueuedAt asc)', () => {
    const store = useMentorStore.getState();
    store.enqueue(plan('crystal.leveled', 70, 100));
    store.enqueue(plan('mentor.bubble.click', 90, 200));
    store.enqueue(plan('session.completed', 60, 50));
    store.enqueue(plan('crystal.leveled', 70, 80));

    const queue = useMentorStore.getState().dialogQueue;
    expect(queue.map((p) => p.trigger)).toEqual([
      'mentor.bubble.click',
      'crystal.leveled',
      'crystal.leveled',
      'session.completed',
    ]);
    // Same-priority order: enqueuedAt 80 before enqueuedAt 100.
    const crystals = queue.filter((p) => p.trigger === 'crystal.leveled');
    expect(crystals.map((p) => p.enqueuedAt)).toEqual([80, 100]);
  });

  it('opens the head from the queue and clears it', () => {
    const store = useMentorStore.getState();
    store.enqueue(plan('mentor.bubble.click', 90, 1));
    expect(useMentorStore.getState().dialogQueue).toHaveLength(1);

    const opened = store.openCurrentFromQueue();
    expect(opened?.trigger).toBe('mentor.bubble.click');
    expect(useMentorStore.getState().currentDialog?.trigger).toBe('mentor.bubble.click');
    expect(useMentorStore.getState().dialogQueue).toHaveLength(0);
  });

  it('marks triggers seen idempotently and records cooldowns', () => {
    const store = useMentorStore.getState();
    store.markSeen('onboarding.welcome');
    store.markSeen('onboarding.welcome');
    expect(useMentorStore.getState().seenTriggers).toEqual(['onboarding.welcome']);

    store.recordCooldown('crystal.leveled', 12345);
    expect(useMentorStore.getState().cooldowns['crystal.leveled']).toBe(12345);
  });

  it('cycles variant indices with an injected RNG (deterministic)', () => {
    const store = useMentorStore.getState();
    let i = 0;
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const rng = () => seq[i++ % seq.length]!;

    const indices: number[] = [];
    for (let n = 0; n < 6; n++) {
      indices.push(store.nextVariantIndex('session.completed', 3, rng));
    }
    // First three indices form a permutation of [0,1,2].
    expect(new Set(indices.slice(0, 3))).toEqual(new Set([0, 1, 2]));
    // After exhaustion, reshuffle: head must differ from previous tail.
    expect(indices[3]).not.toBe(indices[2]);
    expect(new Set(indices.slice(3, 6))).toEqual(new Set([0, 1, 2]));
  });

  it('throws when variantCount is zero', () => {
    expect(() =>
      useMentorStore.getState().nextVariantIndex('crystal.leveled', 0),
    ).toThrow();
  });
});

describe('migrateMentorState', () => {
  it('returns defaults on first load', () => {
    expect(migrateMentorState(undefined, 0)).toEqual(DEFAULT_PERSISTED_STATE);
    expect(migrateMentorState(null, 0)).toEqual(DEFAULT_PERSISTED_STATE);
    expect(migrateMentorState({}, 1)).toMatchObject({
      mentorLocale: 'en',
      playerName: null,
      seenTriggers: [],
      narrationEnabled: true,
      cooldowns: {},
    });
  });

  it('coerces partial payloads safely', () => {
    const result = migrateMentorState(
      {
        playerName: 'Sergio',
        ttsMuted: true,
        seenTriggers: ['onboarding.welcome', 42 as unknown as string],
        cooldowns: { 'crystal.leveled': 999 },
        firstSubjectGenerationEnqueuedAt: 12345,
      },
      1,
    );
    expect(result.playerName).toBe('Sergio');
    expect(result.narrationEnabled).toBe(false);
    expect(result.seenTriggers).toEqual(['onboarding.welcome']);
    expect(result.cooldowns['crystal.leveled']).toBe(999);
    expect(result.firstSubjectGenerationEnqueuedAt).toBe(12345);
    expect(result.mentorLocale).toBe('en');
  });

  it('never throws on garbage', () => {
    expect(() => migrateMentorState('not an object' as unknown, 99)).not.toThrow();
    expect(migrateMentorState('not an object' as unknown, 99)).toEqual(
      DEFAULT_PERSISTED_STATE,
    );
  });
});
