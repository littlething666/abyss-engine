import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../store/studySettingsStore', () => {
  let provider: 'local' | 'openrouter' = 'local';
  return {
    getSurfaceBinding: () => ({ provider, openRouterConfigId: provider === 'openrouter' ? 'cfg-1' : null }),
    getOpenRouterConfigById: () => ({
      id: 'cfg-1',
      label: 'x',
      model: 'x/y',
      enableReasoning: false,
      enableStreaming: false,
    }),
    getLocalModelId: () => '',
    __setProvider: (p: 'local' | 'openrouter') => { provider = p; },
  };
});

import {
  getChatCompletionsRepositoryForSurface,
  resetLlmInferenceRegistryForTests,
} from './llmInferenceRegistry';
import { resolveLlmWorkerChatUrl } from './openRouterDefaults';
import {
  createHttpChatCompletionsRepositoryFromEnv,
  HttpChatCompletionsRepository,
} from './repositories/HttpChatCompletionsRepository';

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

  it('mirrors registry wiring: local FromEnv does not retry 502; Worker URL + isRetryEligible retries', async () => {
    const originalFetch = globalThis.fetch;
    const delayFn = vi.fn(async () => {});
    const localUrl = 'http://localhost:8080/v1/chat/completions';
    vi.stubEnv('NEXT_PUBLIC_LLM_CHAT_URL', localUrl);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'never' } }] }),
      }) as unknown as typeof fetch;

    const localRepo = createHttpChatCompletionsRepositoryFromEnv();
    await expect(
      localRepo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow('Chat completion failed (502)');
    expect(fetch).toHaveBeenCalledTimes(1);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'from-worker' } }] }),
      }) as unknown as typeof fetch;

    const workerRepo = new HttpChatCompletionsRepository(
      resolveLlmWorkerChatUrl(),
      '',
      null,
      true,
      delayFn,
    );
    const openResult = await workerRepo.completeChat({
      model: 'x/y',
      messages: [{ role: 'user', content: 'z' }],
    });
    expect(openResult.content).toBe('from-worker');
    expect(fetch).toHaveBeenCalledTimes(2);

    globalThis.fetch = originalFetch;
  });
});
