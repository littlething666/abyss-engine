import { create } from 'zustand';

/**
 * Feature-flags store — persistent user preferences for toggling optional surfaces
 * and global sound effects. All flags default to the least-intrusive state (OFF).
 *
 * Storage key: `abyss.feature-flags`.
 */

const STORAGE_KEY = 'abyss.feature-flags';

export interface FeatureFlagsState {
  /** When true, the Pomodoro timer overlay is rendered in the scene HUD. */
  pomodoroVisible: boolean;
  /** When true, the Ritual (Attunement) entry point is exposed in the Wisdom Altar header. */
  ritualVisible: boolean;
  /** Master gate for scene / feedback sound effects (not TTS). */
  sfxEnabled: boolean;
}

export interface FeatureFlagsActions {
  setPomodoroVisible: (v: boolean) => void;
  setRitualVisible: (v: boolean) => void;
  setSfxEnabled: (v: boolean) => void;
  toggleSfxEnabled: () => void;
}

export type FeatureFlagsStore = FeatureFlagsState & FeatureFlagsActions;

const DEFAULT_STATE: FeatureFlagsState = {
  pomodoroVisible: false,
  ritualVisible: false,
  sfxEnabled: false,
};

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  return (globalThis as { localStorage?: Storage }).localStorage ?? null;
}

function readSnapshot(): FeatureFlagsState {
  const storage = getStorage();
  if (!storage) return DEFAULT_STATE;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<FeatureFlagsState>;
    return {
      pomodoroVisible:
        typeof parsed.pomodoroVisible === 'boolean' ? parsed.pomodoroVisible : DEFAULT_STATE.pomodoroVisible,
      ritualVisible:
        typeof parsed.ritualVisible === 'boolean' ? parsed.ritualVisible : DEFAULT_STATE.ritualVisible,
      sfxEnabled:
        typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : DEFAULT_STATE.sfxEnabled,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeSnapshot(snapshot: FeatureFlagsState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private-mode errors
  }
}

export const useFeatureFlagsStore = create<FeatureFlagsStore>((set, get) => {
  const initial = readSnapshot();
  writeSnapshot(initial);

  const persist = (patch: Partial<FeatureFlagsState>) => {
    const current = get();
    const snapshot: FeatureFlagsState = {
      pomodoroVisible: patch.pomodoroVisible ?? current.pomodoroVisible,
      ritualVisible: patch.ritualVisible ?? current.ritualVisible,
      sfxEnabled: patch.sfxEnabled ?? current.sfxEnabled,
    };
    writeSnapshot(snapshot);
    set(patch);
  };

  return {
    ...initial,
    setPomodoroVisible: (v) => persist({ pomodoroVisible: v }),
    setRitualVisible: (v) => persist({ ritualVisible: v }),
    setSfxEnabled: (v) => persist({ sfxEnabled: v }),
    toggleSfxEnabled: () => persist({ sfxEnabled: !get().sfxEnabled }),
  };
});

/** Synchronous accessor for non-React code paths (e.g. `src/utils/sound.ts`). */
export function getSfxEnabled(): boolean {
  return useFeatureFlagsStore.getState().sfxEnabled;
}
