import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_PERSONALITY_OPTIONS,
  createStudySettingsStore,
  STUDY_SETTINGS_STORAGE_KEY,
  TARGET_AUDIENCE_OPTIONS,
} from './studySettingsStore';
import {
  OPENROUTER_MODEL_OPTIONS,
  STUDY_SURFACE_DEFAULT_MODEL,
} from '../infrastructure/openRouterDefaults';

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

  it('seeds OpenRouter configs from openRouterDefaults', () => {
    const store = createStudySettingsStore();
    const configs = store.getState().openRouterConfigs;
    expect(configs.length).toBe(OPENROUTER_MODEL_OPTIONS.length);
    expect(configs[0].model).toBe(OPENROUTER_MODEL_OPTIONS[0]);
  });

  it('defaults only study-hook surfaces to OpenRouter study model', () => {
    const store = createStudySettingsStore();
    const configs = store.getState().openRouterConfigs;
    expect(Object.keys(store.getState().surfaceProviders).sort()).toEqual([
      'studyFormulaExplain',
      'studyQuestionExplain',
    ]);
    for (const id of ['studyQuestionExplain', 'studyFormulaExplain'] as const) {
      const binding = store.getState().surfaceProviders[id];
      expect(binding.provider).toBe('openrouter');
      const cfg = configs.find((c) => c.id === binding.openRouterConfigId);
      expect(cfg?.model).toBe(STUDY_SURFACE_DEFAULT_MODEL);
      expect(cfg?.enableStreaming).toBe(true);
    }
  });

  it('drops legacy generation surface bindings and response-healing settings on load', () => {
    const seededStore = createStudySettingsStore();
    const configs = seededStore.getState().openRouterConfigs;
    localStorage.setItem(STUDY_SETTINGS_STORAGE_KEY, JSON.stringify({
      targetAudience: TARGET_AUDIENCE_OPTIONS[0],
      agentPersonality: AGENT_PERSONALITY_OPTIONS[0],
      localModelId: '',
      openRouterResponseHealing: false,
      openRouterConfigs: configs,
      surfaceProviders: {
        studyQuestionExplain: { provider: 'openrouter', openRouterConfigId: configs[0].id },
        subjectGenerationTopics: { provider: 'openrouter', openRouterConfigId: configs[1]?.id ?? configs[0].id },
        subjectGenerationEdges: { provider: 'openrouter', openRouterConfigId: configs[1]?.id ?? configs[0].id },
        topicContent: { provider: 'openrouter', openRouterConfigId: configs[1]?.id ?? configs[0].id },
        crystalTrial: { provider: 'openrouter', openRouterConfigId: configs[1]?.id ?? configs[0].id },
      },
    }));

    const migrated = createStudySettingsStore().getState();
    expect(Object.keys(migrated.surfaceProviders).sort()).toEqual([
      'studyFormulaExplain',
      'studyQuestionExplain',
    ]);
    expect('openRouterResponseHealing' in migrated).toBe(false);
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

  it('normalizes study defaults and local model settings', () => {
    const store = createStudySettingsStore();
    store.getState().setTargetAudience(TARGET_AUDIENCE_OPTIONS[2]);
    store.getState().setAgentPersonality(AGENT_PERSONALITY_OPTIONS[1]);
    store.getState().setLocalModelId('llama-3.1-8b');
    expect(store.getState().targetAudience).toBe(TARGET_AUDIENCE_OPTIONS[2]);
    expect(store.getState().agentPersonality).toBe(AGENT_PERSONALITY_OPTIONS[1]);
    expect(store.getState().localModelId).toBe('llama-3.1-8b');
  });

  it('manages OpenRouter configs and cascades study bindings to fallback', () => {
    const store = createStudySettingsStore();
    const firstId = store.getState().openRouterConfigs[0].id;
    const secondId = store.getState().openRouterConfigs[1]?.id;
    const id = store.getState().addOpenRouterConfig({
      label: 'Claude',
      model: 'mistralai/mistral-small-2603',
      enableReasoning: false,
      enableStreaming: false,
    });
    expect(store.getState().openRouterConfigs.at(-1)?.id).toBe(id);
    expect(store.getState().openRouterConfigs.at(-1)?.supportedParameters).toEqual([
      'tools',
      'response_format',
      'structured_outputs',
    ]);

    // Study surfaces default to STUDY_SURFACE_DEFAULT_MODEL (not configs[0]); bind explicitly so
    // deleting firstId exercises cascade onto the next surviving config.
    store.getState().setSurfaceConfigId('studyQuestionExplain', firstId);
    store.getState().deleteOpenRouterConfig(firstId);
    const binding = store.getState().surfaceProviders.studyQuestionExplain;
    if (secondId) {
      expect(binding).toEqual({ provider: 'openrouter', openRouterConfigId: secondId });
    } else {
      expect(binding).toEqual({ provider: 'local', openRouterConfigId: null });
    }
  });

  it('binds and validates only study surfaces', () => {
    const store = createStudySettingsStore();
    store.getState().setSurfaceProvider('studyQuestionExplain', 'openrouter');
    expect(store.getState().surfaceProviders.studyQuestionExplain.provider).toBe('openrouter');
    expect(() => store.getState().setSurfaceConfigId('studyQuestionExplain', 'does-not-exist')).toThrow();
  });
});
