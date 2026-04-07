import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_PERSONALITY_OPTIONS,
  createStudySettingsStore,
  OPENAI_COMPATIBLE_MODEL_OPTIONS,
  STUDY_SETTINGS_STORAGE_KEY,
  TARGET_AUDIENCE_OPTIONS,
} from './studySettingsStore';

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

type PersistedBlob = {
  targetAudience: string;
  agentPersonality: string;
  openAiCompatibleApiKey: string;
  openAiCompatibleChatUrl: string;
  openAiCompatibleModelId: string;
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

  it('defaults agentPersonality to Expert lecturer', () => {
    const store = createStudySettingsStore();
    expect(store.getState().agentPersonality).toBe(AGENT_PERSONALITY_OPTIONS[0]);
  });

  it('defaults openAiCompatibleApiKey to empty string', () => {
    const store = createStudySettingsStore();
    expect(store.getState().openAiCompatibleApiKey).toBe('');
  });

  it('defaults openAiCompatibleChatUrl to empty string', () => {
    const store = createStudySettingsStore();
    expect(store.getState().openAiCompatibleChatUrl).toBe('');
  });

  it('defaults openAiCompatibleModelId to empty string', () => {
    const store = createStudySettingsStore();
    expect(store.getState().openAiCompatibleModelId).toBe('');
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

  it('updates agentPersonality via setter', () => {
    const store = createStudySettingsStore();
    const next = AGENT_PERSONALITY_OPTIONS[2];
    store.getState().setAgentPersonality(next);
    expect(store.getState().agentPersonality).toBe(next);
  });

  it('restores persisted agentPersonality on initialization', () => {
    localStorage.setItem(
      STUDY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetAudience: TARGET_AUDIENCE_OPTIONS[0],
        agentPersonality: AGENT_PERSONALITY_OPTIONS[3],
        openAiCompatibleApiKey: '',
        openAiCompatibleChatUrl: '',
        openAiCompatibleModelId: '',
      }),
    );
    const store = createStudySettingsStore();
    expect(store.getState().agentPersonality).toBe(AGENT_PERSONALITY_OPTIONS[3]);
  });

  it('restores persisted openAiCompatibleApiKey on initialization', () => {
    localStorage.setItem(
      STUDY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetAudience: TARGET_AUDIENCE_OPTIONS[0],
        agentPersonality: AGENT_PERSONALITY_OPTIONS[0],
        openAiCompatibleApiKey: 'sk-test-key',
        openAiCompatibleChatUrl: '',
        openAiCompatibleModelId: '',
      }),
    );
    const store = createStudySettingsStore();
    expect(store.getState().openAiCompatibleApiKey).toBe('sk-test-key');
  });

  it('restores persisted openAiCompatibleChatUrl and model id on initialization', () => {
    localStorage.setItem(
      STUDY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetAudience: TARGET_AUDIENCE_OPTIONS[0],
        agentPersonality: AGENT_PERSONALITY_OPTIONS[0],
        openAiCompatibleApiKey: '',
        openAiCompatibleChatUrl: 'https://proxy.example/v1/chat/completions',
        openAiCompatibleModelId: OPENAI_COMPATIBLE_MODEL_OPTIONS[2],
      }),
    );
    const store = createStudySettingsStore();
    expect(store.getState().openAiCompatibleChatUrl).toBe('https://proxy.example/v1/chat/completions');
    expect(store.getState().openAiCompatibleModelId).toBe(OPENAI_COMPATIBLE_MODEL_OPTIONS[2]);
  });

  it('normalizes unknown model id in storage to empty string', () => {
    localStorage.setItem(
      STUDY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetAudience: TARGET_AUDIENCE_OPTIONS[0],
        agentPersonality: AGENT_PERSONALITY_OPTIONS[0],
        openAiCompatibleApiKey: '',
        openAiCompatibleChatUrl: '',
        openAiCompatibleModelId: 'not-a-listed-model',
      }),
    );
    const store = createStudySettingsStore();
    expect(store.getState().openAiCompatibleModelId).toBe('');
  });

  it('migrates storage with only targetAudience: defaults other fields', () => {
    localStorage.setItem(STUDY_SETTINGS_STORAGE_KEY, JSON.stringify({ targetAudience: TARGET_AUDIENCE_OPTIONS[1] }));
    const store = createStudySettingsStore();
    expect(store.getState().agentPersonality).toBe(AGENT_PERSONALITY_OPTIONS[0]);
    expect(store.getState().openAiCompatibleApiKey).toBe('');
    expect(store.getState().openAiCompatibleChatUrl).toBe('');
    expect(store.getState().openAiCompatibleModelId).toBe('');
  });

  it('setTargetAudience preserves other fields in storage', () => {
    localStorage.setItem(
      STUDY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetAudience: TARGET_AUDIENCE_OPTIONS[0],
        agentPersonality: AGENT_PERSONALITY_OPTIONS[4],
        openAiCompatibleApiKey: 'k1',
        openAiCompatibleChatUrl: 'https://u.example/chat',
        openAiCompatibleModelId: OPENAI_COMPATIBLE_MODEL_OPTIONS[1],
      }),
    );
    const store = createStudySettingsStore();
    store.getState().setTargetAudience(TARGET_AUDIENCE_OPTIONS[2]);
    const raw = localStorage.getItem(STUDY_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as PersistedBlob;
    expect(parsed.targetAudience).toBe(TARGET_AUDIENCE_OPTIONS[2]);
    expect(parsed.agentPersonality).toBe(AGENT_PERSONALITY_OPTIONS[4]);
    expect(parsed.openAiCompatibleApiKey).toBe('k1');
    expect(parsed.openAiCompatibleChatUrl).toBe('https://u.example/chat');
    expect(parsed.openAiCompatibleModelId).toBe(OPENAI_COMPATIBLE_MODEL_OPTIONS[1]);
  });

  it('setAgentPersonality preserves other fields in storage', () => {
    localStorage.setItem(
      STUDY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetAudience: TARGET_AUDIENCE_OPTIONS[3],
        agentPersonality: AGENT_PERSONALITY_OPTIONS[0],
        openAiCompatibleApiKey: 'k2',
        openAiCompatibleChatUrl: '',
        openAiCompatibleModelId: '',
      }),
    );
    const store = createStudySettingsStore();
    store.getState().setAgentPersonality(AGENT_PERSONALITY_OPTIONS[1]);
    const raw = localStorage.getItem(STUDY_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as PersistedBlob;
    expect(parsed.targetAudience).toBe(TARGET_AUDIENCE_OPTIONS[3]);
    expect(parsed.agentPersonality).toBe(AGENT_PERSONALITY_OPTIONS[1]);
    expect(parsed.openAiCompatibleApiKey).toBe('k2');
  });

  it('setOpenAiCompatibleApiKey preserves other fields in storage', () => {
    localStorage.setItem(
      STUDY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetAudience: TARGET_AUDIENCE_OPTIONS[1],
        agentPersonality: AGENT_PERSONALITY_OPTIONS[2],
        openAiCompatibleApiKey: '',
        openAiCompatibleChatUrl: 'https://x.example/chat',
        openAiCompatibleModelId: OPENAI_COMPATIBLE_MODEL_OPTIONS[3],
      }),
    );
    const store = createStudySettingsStore();
    store.getState().setOpenAiCompatibleApiKey('new-secret');
    const raw = localStorage.getItem(STUDY_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as PersistedBlob;
    expect(parsed.targetAudience).toBe(TARGET_AUDIENCE_OPTIONS[1]);
    expect(parsed.agentPersonality).toBe(AGENT_PERSONALITY_OPTIONS[2]);
    expect(parsed.openAiCompatibleApiKey).toBe('new-secret');
    expect(parsed.openAiCompatibleChatUrl).toBe('https://x.example/chat');
    expect(parsed.openAiCompatibleModelId).toBe(OPENAI_COMPATIBLE_MODEL_OPTIONS[3]);
  });

  it('setOpenAiCompatibleChatUrl preserves other fields in storage', () => {
    localStorage.setItem(
      STUDY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetAudience: TARGET_AUDIENCE_OPTIONS[1],
        agentPersonality: AGENT_PERSONALITY_OPTIONS[2],
        openAiCompatibleApiKey: 'k',
        openAiCompatibleChatUrl: '',
        openAiCompatibleModelId: '',
      }),
    );
    const store = createStudySettingsStore();
    store.getState().setOpenAiCompatibleChatUrl('https://new.example/v1/chat/completions');
    const raw = localStorage.getItem(STUDY_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as PersistedBlob;
    expect(parsed.openAiCompatibleChatUrl).toBe('https://new.example/v1/chat/completions');
    expect(parsed.openAiCompatibleApiKey).toBe('k');
  });

  it('setOpenAiCompatibleModelId preserves other fields in storage', () => {
    localStorage.setItem(
      STUDY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetAudience: TARGET_AUDIENCE_OPTIONS[1],
        agentPersonality: AGENT_PERSONALITY_OPTIONS[2],
        openAiCompatibleApiKey: '',
        openAiCompatibleChatUrl: '',
        openAiCompatibleModelId: '',
      }),
    );
    const store = createStudySettingsStore();
    store.getState().setOpenAiCompatibleModelId(OPENAI_COMPATIBLE_MODEL_OPTIONS[2]);
    const raw = localStorage.getItem(STUDY_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as PersistedBlob;
    expect(parsed.openAiCompatibleModelId).toBe(OPENAI_COMPATIBLE_MODEL_OPTIONS[2]);
  });
});
