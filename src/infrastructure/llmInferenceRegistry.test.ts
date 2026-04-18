import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../store/studySettingsStore', () => {
  let provider: 'local' | 'openrouter' = 'local';
  return {
    getSurfaceBinding: () => ({ provider, openRouterConfigId: provider === 'openrouter' ? 'cfg-1' : null }),
    getOpenRouterConfigById: () => ({
      id: 'cfg-1',
      label: 'x',
      model: 'x/y',
      enableThinking: false,
      enableStreaming: false,
    }),
    getLocalModelId: () => '',
    __setProvider: (p: 'local' | 'openrouter') => { provider = p; },
  };
});

import { getChatCompletionsRepositoryForSurface, resetLlmInferenceRegistryForTests } from './llmInferenceRegistry';

interface MockHelpers { __setProvider: (p: 'local' | 'openrouter') => void; }

beforeEach(async () => {
  resetLlmInferenceRegistryForTests();
  const mock = await import('../store/studySettingsStore') as unknown as MockHelpers;
  mock.__setProvider('local');
  vi.stubEnv('NEXT_PUBLIC_LLM_WORKER_URL', 'https://abyss-llm-proxy.example.workers.dev');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('llmInferenceRegistry', () => {
  it('returns a repository for the local surface', () => {
    const repo = getChatCompletionsRepositoryForSurface('studyQuestionExplain');
    expect(repo).toBeDefined();
    expect(typeof repo.completeChat).toBe('function');
    expect(typeof repo.streamChat).toBe('function');
  });

  it('returns a repository for the openrouter surface', async () => {
    const mock = await import('../store/studySettingsStore') as unknown as MockHelpers;
    mock.__setProvider('openrouter');
    resetLlmInferenceRegistryForTests();
    const repo = getChatCompletionsRepositoryForSurface('topicContent');
    expect(repo).toBeDefined();
  });

  it('caches per-provider', () => {
    const a = getChatCompletionsRepositoryForSurface('studyQuestionExplain');
    const b = getChatCompletionsRepositoryForSurface('studyFormulaExplain');
    expect(a).toBe(b);
  });
});
