import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appEventBus } from '@/infrastructure/eventBus';

import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  useMentorStore,
} from '../mentorStore';

describe('mentor → player-profile:updated boundary', () => {
  beforeEach(() => {
    useMentorStore.setState({
      ...DEFAULT_PERSISTED_STATE,
      ...DEFAULT_EPHEMERAL_STATE,
    });
  });

  afterEach(() => {
    useMentorStore.setState({
      ...DEFAULT_PERSISTED_STATE,
      ...DEFAULT_EPHEMERAL_STATE,
    });
    vi.restoreAllMocks();
  });

  it('emits player-profile:updated when setPlayerName is called with a string', () => {
    const handler = vi.fn();
    const off = appEventBus.on('player-profile:updated', handler);
    try {
      useMentorStore.getState().setPlayerName('Sergio');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ playerName: 'Sergio' });
    } finally {
      off();
    }
  });

  it('forwards null when the player name is cleared', () => {
    const handler = vi.fn();
    const off = appEventBus.on('player-profile:updated', handler);
    try {
      useMentorStore.getState().setPlayerName(null);
      expect(handler).toHaveBeenCalledWith({ playerName: null });
    } finally {
      off();
    }
  });

  it('emits exactly one event per setPlayerName call (no duplicate captures)', () => {
    const handler = vi.fn();
    const off = appEventBus.on('player-profile:updated', handler);
    try {
      useMentorStore.getState().setPlayerName('A');
      useMentorStore.getState().setPlayerName('B');
      useMentorStore.getState().setPlayerName(null);
      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenNthCalledWith(1, { playerName: 'A' });
      expect(handler).toHaveBeenNthCalledWith(2, { playerName: 'B' });
      expect(handler).toHaveBeenNthCalledWith(3, { playerName: null });
    } finally {
      off();
    }
  });
});
