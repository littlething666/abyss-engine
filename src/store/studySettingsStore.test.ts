import { beforeEach, describe, expect, it } from 'vitest';
import { createStudySettingsStore, STUDY_SETTINGS_STORAGE_KEY, TARGET_AUDIENCE_OPTIONS } from './studySettingsStore';

const createStorageMock = (): Storage => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => (values.has(key) ? values.get(key) ?? null : null),
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
    key: (index: number) => {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    },
  };
};

describe('studySettingsStore', () => {
  beforeEach(() => {
    const storage = createStorageMock();
    (globalThis as { localStorage: Storage }).localStorage = storage;
    localStorage.clear();
  });

  it('defaults targetAudience to Domain Experts', () => {
    const store = createStudySettingsStore();
    expect(store.getState().targetAudience).toBe('Domain Experts');
  });

  it('updates targetAudience via setter', () => {
    const store = createStudySettingsStore();
    const nextAudience = TARGET_AUDIENCE_OPTIONS[2];
    store.getState().setTargetAudience(nextAudience);
    expect(store.getState().targetAudience).toBe(nextAudience);
  });

  it('restores persisted targetAudience on initialization', () => {
    localStorage.setItem(STUDY_SETTINGS_STORAGE_KEY, JSON.stringify({ targetAudience: TARGET_AUDIENCE_OPTIONS[4] }));
    const store = createStudySettingsStore();
    expect(store.getState().targetAudience).toBe(TARGET_AUDIENCE_OPTIONS[4]);
  });
});
