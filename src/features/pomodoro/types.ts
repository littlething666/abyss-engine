export type PomodoroPhase = 'work' | 'break';

export interface PomodoroState {
  phase: PomodoroPhase;
  isRunning: boolean;
  remainingMs: number;
  completedCycles: number;
  workDurationMs: number;
  breakDurationMs: number;
  lastTickMs: number | null;
  phaseCompleted: boolean;
}

export interface PomodoroActions {
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skipPhase: () => void;
  tick: () => void;
}

export interface PomodoroStore extends PomodoroState, PomodoroActions {}

export interface PomodoroConfig {
  workDurationMs: number;
  breakDurationMs: number;
  autostart?: boolean;
}
