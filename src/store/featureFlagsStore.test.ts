import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createStorageMock(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) ?? null : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
}

async function importFeatureFlagsStore() {
  vi.resetModules();
  return import('./featureFlagsStore');
}

describe('featureFlagsStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults all flags to off', async () => {
    const { useFeatureFlagsStore } = await importFeatureFlagsStore();
    expect(useFeatureFlagsStore.getState().pomodoroVisible).toBe(false);
    expect(useFeatureFlagsStore.getState().pregeneratedCurriculumsVisible).toBe(false);
    expect(useFeatureFlagsStore.getState().ritualVisible).toBe(false);
    expect(useFeatureFlagsStore.getState().sfxEnabled).toBe(false);
  });

  it('persists feature flags when updated', async () => {
    const { useFeatureFlagsStore } = await importFeatureFlagsStore();
    useFeatureFlagsStore.getState().setSfxEnabled(true);
    useFeatureFlagsStore.getState().setPregeneratedCurriculumsVisible(true);
    expect(useFeatureFlagsStore.getState().sfxEnabled).toBe(true);
    expect(useFeatureFlagsStore.getState().pregeneratedCurriculumsVisible).toBe(true);
    const raw = localStorage.getItem('abyss.feature-flags');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).sfxEnabled).toBe(true);
    expect(JSON.parse(raw as string).pregeneratedCurriculumsVisible).toBe(true);
  });

  it('hydrates missing new flags from older storage blobs with defaults', async () => {
    localStorage.setItem(
      'abyss.feature-flags',
      JSON.stringify({
        pomodoroVisible: true,
        ritualVisible: true,
        sfxEnabled: false,
      }),
    );

    const { useFeatureFlagsStore } = await importFeatureFlagsStore();
    expect(useFeatureFlagsStore.getState().pomodoroVisible).toBe(true);
    expect(useFeatureFlagsStore.getState().pregeneratedCurriculumsVisible).toBe(false);
    expect(useFeatureFlagsStore.getState().ritualVisible).toBe(true);
  });
});
