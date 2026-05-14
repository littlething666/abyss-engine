import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_PERSONALITY_OPTIONS,
  createStudySettingsStore,
  STUDY_SETTINGS_STORAGE_KEY,
  TARGET_AUDIENCE_OPTIONS,
} from './studySettingsStore';

const createStorageMock = (): Storage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) ?? null : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  } as Storage;
};

describe('studySettingsStore', () => {
  beforeEach(() => {
    const storage = createStorageMock();
    (globalThis as { localStorage: Storage }).localStorage = storage;
    localStorage.clear();
  });

  it('defaults targetAudience to the first option', () => {
    const store = createStudySettingsStore();
    expect(store.getState().targetAudience).toBe(TARGET_AUDIENCE_OPTIONS[0]);
  });

  it('normalizes legacy persisted blobs to product settings only', () => {
    localStorage.setItem(STUDY_SETTINGS_STORAGE_KEY, JSON.stringify({
      targetAudience: TARGET_AUDIENCE_OPTIONS[2],
      agentPersonality: AGENT_PERSONALITY_OPTIONS[1],
      localModelId: 'llama-3.1-8b',
      openRouterResponseHealing: false,
      openRouterConfigs: [{ id: 'cfg-1', model: 'openai/gpt-oss-120b' }],
      surfaceProviders: {
        studyQuestionExplain: { provider: 'openrouter', openRouterConfigId: 'cfg-1' },
      },
      showStudyHistoryControls: true,
    }));

    const migrated = createStudySettingsStore().getState();
    expect(migrated.targetAudience).toBe(TARGET_AUDIENCE_OPTIONS[2]);
    expect(migrated.agentPersonality).toBe(AGENT_PERSONALITY_OPTIONS[1]);
    expect(migrated.showStudyHistoryControls).toBe(true);
    expect('localModelId' in migrated).toBe(false);
    expect('openRouterConfigs' in migrated).toBe(false);
    expect('surfaceProviders' in migrated).toBe(false);

    const persisted = JSON.parse(localStorage.getItem(STUDY_SETTINGS_STORAGE_KEY) as string) as Record<string, unknown>;
    expect(persisted).toEqual({
      targetAudience: TARGET_AUDIENCE_OPTIONS[2],
      agentPersonality: AGENT_PERSONALITY_OPTIONS[1],
      showStudyHistoryControls: true,
    });
  });

  it('persists study history controls across reloads', () => {
    const store = createStudySettingsStore();
    store.getState().setShowStudyHistoryControls(true);
    expect(store.getState().showStudyHistoryControls).toBe(true);
    const raw = localStorage.getItem(STUDY_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).showStudyHistoryControls).toBe(true);

    const reloaded = createStudySettingsStore();
    expect(reloaded.getState().showStudyHistoryControls).toBe(true);
  });

  it('normalizes study defaults', () => {
    const store = createStudySettingsStore();
    store.getState().setTargetAudience(TARGET_AUDIENCE_OPTIONS[2]);
    store.getState().setAgentPersonality(AGENT_PERSONALITY_OPTIONS[1]);
    expect(store.getState().targetAudience).toBe(TARGET_AUDIENCE_OPTIONS[2]);
    expect(store.getState().agentPersonality).toBe(AGENT_PERSONALITY_OPTIONS[1]);
  });
});
