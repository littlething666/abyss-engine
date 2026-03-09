import { create } from 'zustand';

export const STUDY_SETTINGS_STORAGE_KEY = 'abyss-study-settings';

export const TARGET_AUDIENCE_OPTIONS = [
  'Domain Experts',
  'Programmers',
  'QA',
  'Customer Service',
  'Market Analysts',
  'Sales Reps',
  'Financial Analysts',
  'Lawyers',
  'Graphic Designer',
  'Logistics',
] as const;

export interface StudySettingsState {
  targetAudience: string;
}

export interface StudySettingsActions {
  setTargetAudience: (targetAudience: string) => void;
  resetTargetAudience: () => void;
}

export type StudySettingsStore = StudySettingsState & StudySettingsActions;

const DEFAULT_TARGET_AUDIENCE = TARGET_AUDIENCE_OPTIONS[0];
const targetAudienceSet = new Set<string>(TARGET_AUDIENCE_OPTIONS as readonly string[]);

function safeParseJSON<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeTargetAudience(targetAudience: string): string {
  return targetAudienceSet.has(targetAudience) ? targetAudience : DEFAULT_TARGET_AUDIENCE;
}

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  return storage ?? null;
}

function readTargetAudienceFromStorage(): string {
  const storage = getStorage();
  if (!storage) {
    return DEFAULT_TARGET_AUDIENCE;
  }

  const raw = storage.getItem(STUDY_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_TARGET_AUDIENCE;
  }

  const parsed = safeParseJSON<unknown>(raw);
  if (typeof parsed === 'string') {
    return normalizeTargetAudience(parsed);
  }

  if (parsed && typeof parsed === 'object') {
    const payload = parsed as { targetAudience?: unknown };
    if (typeof payload.targetAudience === 'string') {
      return normalizeTargetAudience(payload.targetAudience);
    }
  }

  return DEFAULT_TARGET_AUDIENCE;
}

function writeTargetAudienceToStorage(targetAudience: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const normalized = normalizeTargetAudience(targetAudience);
  try {
    storage.setItem(STUDY_SETTINGS_STORAGE_KEY, JSON.stringify({ targetAudience: normalized }));
  } catch {
    // localStorage writes can fail in restricted environments
  }
}

export const createStudySettingsStore = () =>
  create<StudySettingsStore>((set) => ({
    targetAudience: readTargetAudienceFromStorage(),

    setTargetAudience: (targetAudience) => {
      const normalized = normalizeTargetAudience(targetAudience);
      writeTargetAudienceToStorage(normalized);
      set({ targetAudience: normalized });
    },

    resetTargetAudience: () => {
      writeTargetAudienceToStorage(DEFAULT_TARGET_AUDIENCE);
      set({ targetAudience: DEFAULT_TARGET_AUDIENCE });
    },
  }));

const store = createStudySettingsStore();

export const useStudySettingsStore = store;
export { store as studySettingsStore };
