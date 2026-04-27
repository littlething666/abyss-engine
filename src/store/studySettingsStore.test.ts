import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_PERSONALITY_OPTIONS,
  createStudySettingsStore,
  STUDY_SETTINGS_STORAGE_KEY,
  TARGET_AUDIENCE_OPTIONS,
} from './studySettingsStore';
import {
  GENERATION_SURFACE_DEFAULT_MODEL,
  OPENROUTER_MODEL_OPTIONS,
  PREVIOUS_GENERATION_SURFACE_DEFAULT_MODEL,
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

  it('defaults study-hook surfaces to OpenRouter → gemma-4-26b with streaming', () => {
    const store = createStudySettingsStore();
    const configs = store.getState().openRouterConfigs;
    const studySurfaces = [
      'studyQuestionExplain',
      'studyFormulaExplain',
      'studyQuestionMermaid',
      'screenCaptureSummary',
    ] as const;
    for (const id of studySurfaces) {
      const binding = store.getState().surfaceProviders[id];
      expect(binding.provider).toBe('openrouter');
      const cfg = configs.find((c) => c.id === binding.openRouterConfigId);
      expect(cfg?.model).toBe(STUDY_SURFACE_DEFAULT_MODEL);
      expect(cfg?.enableStreaming).toBe(true);
    }
  });

  it('defaults generation surfaces to OpenRouter → Mistral Small', () => {
    const store = createStudySettingsStore();
    const configs = store.getState().openRouterConfigs;
    const genSurfaces = [
      'subjectGenerationTopics',
      'subjectGenerationEdges',
      'topicContent',
      'crystalTrial',
    ] as const;
    for (const id of genSurfaces) {
      const binding = store.getState().surfaceProviders[id];
      expect(binding.provider).toBe('openrouter');
      const model = configs.find((c) => c.id === binding.openRouterConfigId)?.model;
      expect(model).toBe(GENERATION_SURFACE_DEFAULT_MODEL);
    }
  });

  it('migrates only surfaces bound to the previous seeded generation default', () => {
    const seededStore = createStudySettingsStore();
    const configs = seededStore.getState().openRouterConfigs;
    const oldConfig = configs.find((config) => config.model === PREVIOUS_GENERATION_SURFACE_DEFAULT_MODEL);
    const customConfig = configs.find((config) => config.model === STUDY_SURFACE_DEFAULT_MODEL);
    expect(oldConfig).toBeTruthy();
    expect(customConfig).toBeTruthy();
    localStorage.setItem(STUDY_SETTINGS_STORAGE_KEY, JSON.stringify({
      targetAudience: TARGET_AUDIENCE_OPTIONS[0],
      agentPersonality: AGENT_PERSONALITY_OPTIONS[0],
      localModelId: '',
      openRouterResponseHealing: true,
      openRouterConfigs: configs,
      surfaceProviders: {
        subjectGenerationTopics: { provider: 'openrouter', openRouterConfigId: oldConfig!.id },
        subjectGenerationEdges: { provider: 'openrouter', openRouterConfigId: oldConfig!.id },
        topicContent: { provider: 'openrouter', openRouterConfigId: customConfig!.id },
        crystalTrial: { provider: 'openrouter', openRouterConfigId: oldConfig!.id },
      },
    }));

    const migrated = createStudySettingsStore().getState();
    const topicContentModel = migrated.openRouterConfigs.find(
      (config) => config.id === migrated.surfaceProviders.topicContent.openRouterConfigId,
    )?.model;
    const topicsModel = migrated.openRouterConfigs.find(
      (config) => config.id === migrated.surfaceProviders.subjectGenerationTopics.openRouterConfigId,
    )?.model;
    expect(topicsModel).toBe(GENERATION_SURFACE_DEFAULT_MODEL);
    expect(topicContentModel).toBe(STUDY_SURFACE_DEFAULT_MODEL);
  });

  it('defaults openRouterResponseHealing to true', () => {
    const store = createStudySettingsStore();
    expect(store.getState().openRouterResponseHealing).toBe(true);
  });

  it('setOpenRouterResponseHealing persists', () => {
    const store = createStudySettingsStore();
    store.getState().setOpenRouterResponseHealing(true);
    expect(store.getState().openRouterResponseHealing).toBe(true);
    const raw = localStorage.getItem(STUDY_SETTINGS_STORAGE_KEY);
    expect(JSON.parse(raw as string).openRouterResponseHealing).toBe(true);
  });

  it('setTargetAudience persists', () => {
    const store = createStudySettingsStore();
    store.getState().setTargetAudience(TARGET_AUDIENCE_OPTIONS[2]);
    expect(store.getState().targetAudience).toBe(TARGET_AUDIENCE_OPTIONS[2]);
    const raw = localStorage.getItem(STUDY_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).targetAudience).toBe(TARGET_AUDIENCE_OPTIONS[2]);
  });

  it('setAgentPersonality normalizes + persists', () => {
    const store = createStudySettingsStore();
    store.getState().setAgentPersonality(AGENT_PERSONALITY_OPTIONS[1]);
    expect(store.getState().agentPersonality).toBe(AGENT_PERSONALITY_OPTIONS[1]);
  });

  it('addOpenRouterConfig appends and returns id', () => {
    const store = createStudySettingsStore();
    const initialLength = store.getState().openRouterConfigs.length;
    const id = store.getState().addOpenRouterConfig({
      label: 'Claude',
      model: 'anthropic/claude-sonnet-4',
      enableReasoning: false,
      enableStreaming: false,
    });
    const configs = store.getState().openRouterConfigs;
    expect(configs.length).toBe(initialLength + 1);
    expect(configs[configs.length - 1].id).toBe(id);
    expect(configs[configs.length - 1].model).toBe('anthropic/claude-sonnet-4');
  });

  it('updateOpenRouterConfig patches model only', () => {
    const store = createStudySettingsStore();
    const id = store.getState().openRouterConfigs[0].id;
    store.getState().updateOpenRouterConfig(id, { model: 'new/model' });
    expect(store.getState().openRouterConfigs[0].model).toBe('new/model');
  });

  it('updateOpenRouterConfig clears supportedParameters when model is unknown', () => {
    const store = createStudySettingsStore();
    const id = store.getState().openRouterConfigs[0].id;
    const before = store.getState().openRouterConfigs[0];
    expect(before.supportedParameters).toEqual(['reasoning']);
    store.getState().updateOpenRouterConfig(id, { model: 'openrouter/elephant-alpha' });
    expect(store.getState().openRouterConfigs[0].supportedParameters).toBeUndefined();
  });

  it('deleteOpenRouterConfig cascades bindings to fallback', () => {
    const store = createStudySettingsStore();
    const firstId = store.getState().openRouterConfigs[0].id;
    const secondId = store.getState().openRouterConfigs[1]?.id;
    store.getState().deleteOpenRouterConfig(firstId);
    expect(store.getState().openRouterConfigs.find((c) => c.id === firstId)).toBeUndefined();
    const studyBinding = store.getState().surfaceProviders.studyQuestionExplain;
    const topicBinding = store.getState().surfaceProviders.topicContent;
    if (secondId) {
      expect(studyBinding.provider).toBe('openrouter');
      expect(studyBinding.openRouterConfigId).toBe(secondId);
      expect(topicBinding.provider).toBe('openrouter');
      const topicModel = store.getState().openRouterConfigs.find((c) => c.id === topicBinding.openRouterConfigId)?.model;
      expect(topicModel).toBe(GENERATION_SURFACE_DEFAULT_MODEL);
    } else {
      expect(studyBinding.provider).toBe('local');
      expect(topicBinding.provider).toBe('local');
    }
  });

  it('setSurfaceProvider to openrouter auto-binds first config', () => {
    const store = createStudySettingsStore();
    store.getState().setSurfaceProvider('studyQuestionExplain', 'openrouter');
    const binding = store.getState().surfaceProviders.studyQuestionExplain;
    expect(binding.provider).toBe('openrouter');
    expect(binding.openRouterConfigId).toBeTruthy();
  });

  it('setSurfaceConfigId throws for unknown config', () => {
    const store = createStudySettingsStore();
    expect(() => store.getState().setSurfaceConfigId('topicContent', 'does-not-exist')).toThrow();
  });

  it('setLocalModelId persists', () => {
    const store = createStudySettingsStore();
    store.getState().setLocalModelId('llama-3.1-8b');
    expect(store.getState().localModelId).toBe('llama-3.1-8b');
  });
});
