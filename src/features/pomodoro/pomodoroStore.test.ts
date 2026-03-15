import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPomodoroStore, formatPomodoroRemaining } from './pomodoroStore';

const TEST_BASE_TIME = new Date('2026-03-15T00:00:00.000Z').getTime();

describe('pomodoroStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats remaining milliseconds as MM:SS', () => {
    expect(formatPomodoroRemaining(125_000)).toBe('02:05');
  });

  it('starts with default work phase state and defaults to stopped', () => {
    const store = createPomodoroStore({ workDurationMs: 1200, breakDurationMs: 900 });
    const state = store.getState();
    expect(state.phase).toBe('work');
    expect(state.isRunning).toBe(false);
    expect(state.remainingMs).toBe(1200);
  });

  it('counts down and transitions from work to break', () => {
    const store = createPomodoroStore({ workDurationMs: 2000, breakDurationMs: 1000 });
    store.getState().start();
    vi.setSystemTime(TEST_BASE_TIME + 2_500);
    store.getState().tick();
    expect(store.getState().isRunning).toBe(true);
    expect(store.getState().phase).toBe('break');
    expect(store.getState().remainingMs).toBe(500);
    expect(store.getState().phaseCompleted).toBe(true);
  });

  it('cycles through a full work period after a long lapse', () => {
    const store = createPomodoroStore({ workDurationMs: 1_000, breakDurationMs: 1_000 });
    store.getState().start();
    store.getState().skipPhase();
    vi.setSystemTime(TEST_BASE_TIME + 2_500);
    store.getState().tick();
    expect(store.getState().phase).toBe('break');
    expect(store.getState().completedCycles).toBe(1);
    expect(store.getState().remainingMs).toBe(500);
    expect(store.getState().phaseCompleted).toBe(true);
  });

  it('can pause and resume without rewinding remaining time', () => {
    const store = createPomodoroStore({ workDurationMs: 5000, breakDurationMs: 1000 });
    store.getState().start();
    vi.setSystemTime(TEST_BASE_TIME + 1_000);
    store.getState().tick();
    store.getState().pause();
    const pausedAt = store.getState().remainingMs;
    vi.setSystemTime(TEST_BASE_TIME + 10_000);
    store.getState().tick();
    expect(store.getState().remainingMs).toBe(pausedAt);
    store.getState().resume();
    vi.setSystemTime(TEST_BASE_TIME + 11_000);
    store.getState().tick();
    expect(store.getState().remainingMs).toBe(3000);
  });
});
