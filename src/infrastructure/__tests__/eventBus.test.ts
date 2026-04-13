import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appEventBus } from '../eventBus';

describe('appEventBus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes, emits, and cleans up', () => {
    const handler = vi.fn();
    const unsub = appEventBus.on('xp:gained', handler);
    appEventBus.emit('xp:gained', {
      topicId: 't',
      amount: 1,
      sessionId: 's',
      cardId: 'c',
    });
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
    appEventBus.emit('xp:gained', {
      topicId: 't',
      amount: 2,
      sessionId: 's',
      cardId: 'c',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('uses abyss- prefixed CustomEvent types', () => {
    const types: string[] = [];
    const listener = (e: Event) => types.push(e.type);
    window.addEventListener('abyss-card:reviewed', listener);
    appEventBus.emit('card:reviewed', {
      cardId: 'c',
      rating: 3,
      topicId: 't',
      sessionId: 's',
      timeTakenMs: 0,
      buffedReward: 10,
      buffMultiplier: 1,
      difficulty: 1,
      isCorrect: true,
    });
    window.removeEventListener('abyss-card:reviewed', listener);
    expect(types).toEqual(['abyss-card:reviewed']);
  });
});
