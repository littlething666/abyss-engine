import { create } from 'zustand';

import {
  PomodoroActions,
  PomodoroConfig,
  PomodoroPhase,
  PomodoroStore,
} from './types';

const DEFAULT_WORK_DURATION_MS = 25 * 60 * 1000;
const DEFAULT_BREAK_DURATION_MS = 5 * 60 * 1000;
const MAX_TICK_ITERATIONS = 32;

const clampMs = (value: number): number => {
  return Math.max(1, Math.floor(value));
};

const defaultConfig = {
  workDurationMs: DEFAULT_WORK_DURATION_MS,
  breakDurationMs: DEFAULT_BREAK_DURATION_MS,
  autostart: false,
};

const normalizeConfig = (config: Partial<PomodoroConfig>): PomodoroConfig => {
  return {
    workDurationMs: clampMs(config.workDurationMs ?? defaultConfig.workDurationMs),
    breakDurationMs: clampMs(config.breakDurationMs ?? defaultConfig.breakDurationMs),
    autostart: config.autostart ?? defaultConfig.autostart,
  };
};

function getInitialState(config: PomodoroConfig): PomodoroStore {
  const autostart = config.autostart ?? false;
  return {
    phase: 'work',
    isRunning: autostart,
    remainingMs: config.workDurationMs,
    completedCycles: 0,
    workDurationMs: config.workDurationMs,
    breakDurationMs: config.breakDurationMs,
    phaseCompleted: false,
    lastTickMs: autostart ? Date.now() : null,
    start: () => undefined,
    pause: () => undefined,
    resume: () => undefined,
    reset: () => undefined,
    skipPhase: () => undefined,
    tick: () => undefined,
  };
}

const transitionAfterOverflow = (
  phase: PomodoroPhase,
  remainingMs: number,
  workDurationMs: number,
  breakDurationMs: number,
  completedCycles: number,
): {
  phase: PomodoroPhase;
  remainingMs: number;
  completedCycles: number;
  didTransition: boolean;
} => {
  let nextPhase = phase;
  let nextRemainingMs = remainingMs;
  let nextCompletedCycles = completedCycles;
  let guard = 0;
  let didTransition = false;

  while (nextRemainingMs <= 0 && guard < MAX_TICK_ITERATIONS) {
    didTransition = true;

    if (nextPhase === 'work') {
      nextPhase = 'break';
      nextRemainingMs += breakDurationMs;
    } else {
      nextPhase = 'work';
      nextRemainingMs += workDurationMs;
      nextCompletedCycles += 1;
    }
    guard += 1;
  }

  if (nextRemainingMs <= 0) {
    nextRemainingMs = 0;
  }

  return {
    phase: nextPhase,
    remainingMs: nextRemainingMs,
    completedCycles: nextCompletedCycles,
    didTransition,
  };
};

export const createPomodoroStore = (partialConfig: Partial<PomodoroConfig> = {}) => {
  const config = normalizeConfig(partialConfig);

  return create<PomodoroStore>((set) => ({
    ...getInitialState(config),

    start: () => {
      const nowMs = Date.now();
      set({
        phase: 'work',
        isRunning: true,
        remainingMs: config.workDurationMs,
        completedCycles: 0,
        phaseCompleted: false,
        lastTickMs: nowMs,
      });
    },

    pause: () => {
      set((state) => {
        if (!state.isRunning) {
          return state;
        }
        return {
          isRunning: false,
          phaseCompleted: false,
          lastTickMs: null,
        };
      });
    },

    resume: () => {
      const nowMs = Date.now();
      set((state) => {
        if (state.isRunning) {
          return state;
        }
        return {
          isRunning: true,
          phaseCompleted: false,
          lastTickMs: nowMs,
        };
      });
    },

    reset: () => {
      set({
        phase: 'work',
        isRunning: false,
        remainingMs: config.workDurationMs,
        completedCycles: 0,
        phaseCompleted: false,
        lastTickMs: null,
      });
    },

    skipPhase: () => {
      const nowMs = Date.now();
      set((state) => {
        const nextPhase = state.phase === 'work' ? 'break' : 'work';
        return {
          phase: nextPhase,
          remainingMs: nextPhase === 'work' ? state.workDurationMs : state.breakDurationMs,
          completedCycles: nextPhase === 'work' ? state.completedCycles + (state.phase === 'break' ? 1 : 0) : state.completedCycles,
          phaseCompleted: false,
          lastTickMs: nowMs,
          isRunning: true,
        };
      });
    },

    tick: () => {
      const nowMs = Date.now();
      set((state) => {
        if (!state.isRunning) {
          return state;
        }

        const lastTickMs = state.lastTickMs ?? nowMs;
        const elapsed = Math.max(0, nowMs - lastTickMs);
        if (elapsed === 0) {
          return state;
        }

        const projectedRemainingMs = state.remainingMs - elapsed;
        if (projectedRemainingMs > 0) {
          return {
            ...state,
            remainingMs: projectedRemainingMs,
            phaseCompleted: false,
            lastTickMs: nowMs,
          };
        }

        const transition = transitionAfterOverflow(
          state.phase,
          projectedRemainingMs,
          state.workDurationMs,
          state.breakDurationMs,
          state.completedCycles,
        );

        return {
          ...state,
          phase: transition.phase,
          remainingMs: transition.remainingMs,
          phaseCompleted: transition.didTransition,
          completedCycles: transition.completedCycles,
          lastTickMs: nowMs,
        };
      });
    },
  }));
};

export const formatPomodoroRemaining = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');
  return `${paddedMinutes}:${paddedSeconds}`;
};

export const pomodoroStore = createPomodoroStore({
  ...defaultConfig,
  autostart: false,
});
