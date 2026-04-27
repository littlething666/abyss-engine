import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IChatCompletionsRepository } from '@/types/llm';

import { useContentGenerationStore } from './contentGenerationStore';
import { runContentGenerationJob } from './runContentGenerationJob';

const { surfaceProvidersApi } = vi.hoisted(() => ({
  surfaceProvidersApi: {
    resolveIncludeOpenRouterReasoningParam: vi.fn(),
    resolveOpenRouterStructuredJsonChatExtras: vi.fn(),
  },
}));

vi.mock('@/infrastructure/repositories/contentGenerationLogRepository', () => ({
  persistTerminalJob: vi.fn().mockResolvedValue(undefined),
  persistPipeline: vi.fn().mockResolvedValue(undefined),
  clearPersistedLogs: vi.fn().mockResolvedValue(undefined),
  loadPersistedLogs: vi.fn().mockResolvedValue({ jobs: [], pipelines: [] }),
}));

vi.mock('@/infrastructure/llmInferenceSurfaceProviders', () => ({
  resolveIncludeOpenRouterReasoningParam: surfaceProvidersApi.resolveIncludeOpenRouterReasoningParam,
  resolveOpenRouterStructuredJsonChatExtras: surfaceProvidersApi.resolveOpenRouterStructuredJsonChatExtras,
}));

function resetStore(): void {
  useContentGenerationStore.setState({
    jobs: {},
    pipelines: {},
    abortControllers: {},
    pipelineAbortControllers: {},
  });
}

describe('runContentGenerationJob', () => {
  beforeEach(() => {
    resetStore();
    surfaceProvidersApi.resolveIncludeOpenRouterReasoningParam.mockReset();
    surfaceProvidersApi.resolveIncludeOpenRouterReasoningParam.mockReturnValue(false);
    surfaceProvidersApi.resolveOpenRouterStructuredJsonChatExtras.mockReset();
    surfaceProvidersApi.resolveOpenRouterStructuredJsonChatExtras.mockReturnValue(null);
  });

  it('runs pending → streaming → parsing → saving → completed', async () => {
    const streamChat = vi.fn(async function* stream() {
      yield { type: 'content' as const, text: 'ok' };
    });
    const chat: Pick<IChatCompletionsRepository, 'streamChat'> = { streamChat };

    const persistOutput = vi.fn().mockResolvedValue(undefined);

    const result = await runContentGenerationJob({
      kind: 'topic-theory',
      label: 'Theory — T',
      pipelineId: null,
      subjectId: 'sub',
      topicId: 'top',
      llmSurfaceId: 'topicContent',
      chat: chat as IChatCompletionsRepository,
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      enableReasoning: false,
      parseOutput: async () => ({ ok: true, data: 42 }),
      persistOutput,
    });

    expect(result.ok).toBe(true);
    expect(persistOutput).toHaveBeenCalledTimes(1);

    const jobs = Object.values(useContentGenerationStore.getState().jobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe('completed');
    expect(jobs[0]!.rawOutput).toBe('ok');
    expect(jobs[0]!.startedAt).not.toBeNull();
  });

  it('marks job failed when parseOutput returns ok: false', async () => {
    const streamChat = vi.fn(async function* stream() {
      yield { type: 'content' as const, text: 'bad' };
    });
    const chat: Pick<IChatCompletionsRepository, 'streamChat'> = { streamChat };

    const result = await runContentGenerationJob({
      kind: 'topic-theory',
      label: 'L',
      pipelineId: null,
      subjectId: null,
      topicId: null,
      llmSurfaceId: 'topicContent',
      chat: chat as IChatCompletionsRepository,
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      enableReasoning: false,
      parseOutput: async () => ({ ok: false, error: 'parse failed', parseError: 'parse failed' }),
      persistOutput: vi.fn(),
    });

    expect(result.ok).toBe(false);
    const j = Object.values(useContentGenerationStore.getState().jobs)[0];
    expect(j?.status).toBe('failed');
    expect(j?.parseError).toBe('parse failed');
  });

  it('finishes aborted when external signal aborts', async () => {
    const ac = new AbortController();
    ac.abort();

    const streamChat = vi.fn(async function* stream() {
      yield { type: 'content' as const, text: 'x' };
    });
    const chat: Pick<IChatCompletionsRepository, 'streamChat'> = { streamChat };

    const result = await runContentGenerationJob({
      kind: 'topic-theory',
      label: 'L',
      pipelineId: null,
      subjectId: null,
      topicId: null,
      llmSurfaceId: 'topicContent',
      chat: chat as IChatCompletionsRepository,
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      enableReasoning: false,
      externalSignal: ac.signal,
      parseOutput: async () => ({ ok: true, data: null }),
      persistOutput: vi.fn(),
    });

    expect(result.ok).toBe(false);
    const j = Object.values(useContentGenerationStore.getState().jobs)[0];
    expect(j?.status).toBe('aborted');
  });

  it('forces reasoning off in structured OpenRouter requests', async () => {
    surfaceProvidersApi.resolveIncludeOpenRouterReasoningParam.mockReturnValue(true);
    surfaceProvidersApi.resolveOpenRouterStructuredJsonChatExtras.mockReturnValue({
      responseFormat: { type: 'json_object' },
      plugins: [{ id: 'response-healing' }],
      forceNonStreaming: true,
    });

    const streamChat = vi.fn(async function* stream() {
      yield { type: 'content' as const, text: '{}' };
    });
    const chat: Pick<IChatCompletionsRepository, 'streamChat'> = { streamChat };

    await runContentGenerationJob({
      kind: 'topic-study-cards',
      label: 'Study cards — T',
      pipelineId: null,
      subjectId: 'sub',
      topicId: 'top',
      llmSurfaceId: 'topicContent',
      chat: chat as IChatCompletionsRepository,
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      enableReasoning: true,
      parseOutput: async () => ({ ok: true, data: 42 }),
      persistOutput: vi.fn(),
    });

    expect(streamChat).toHaveBeenCalledWith(expect.objectContaining({
      includeOpenRouterReasoning: true,
      enableReasoning: false,
      enableStreaming: false,
      responseFormat: { type: 'json_object' },
      plugins: [{ id: 'response-healing' }],
    }));
  });

  it('keeps reasoning enabled for non-structured requests when requested', async () => {
    surfaceProvidersApi.resolveIncludeOpenRouterReasoningParam.mockReturnValue(true);

    const streamChat = vi.fn(async function* stream() {
      yield { type: 'content' as const, text: 'ok' };
    });
    const chat: Pick<IChatCompletionsRepository, 'streamChat'> = { streamChat };

    await runContentGenerationJob({
      kind: 'topic-theory',
      label: 'Theory — T',
      pipelineId: null,
      subjectId: 'sub',
      topicId: 'top',
      llmSurfaceId: 'topicContent',
      chat: chat as IChatCompletionsRepository,
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      enableReasoning: true,
      parseOutput: async () => ({ ok: true, data: 42 }),
      persistOutput: vi.fn(),
    });

    expect(streamChat).toHaveBeenCalledWith(expect.objectContaining({
      includeOpenRouterReasoning: true,
      enableReasoning: true,
    }));
  });
});
