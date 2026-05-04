import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IChatCompletionsRepository } from '@/types/llm';

import { useContentGenerationStore } from './contentGenerationStore';
import { runContentGenerationJob } from './runContentGenerationJob';

const { surfaceProvidersApi } = vi.hoisted(() => ({
  surfaceProvidersApi: {
    resolveIncludeOpenRouterReasoningParam: vi.fn(),
    resolveOpenRouterStructuredChatExtrasForJob: vi.fn(),
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
  resolveOpenRouterStructuredChatExtrasForJob: surfaceProvidersApi.resolveOpenRouterStructuredChatExtrasForJob,
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
    surfaceProvidersApi.resolveOpenRouterStructuredChatExtrasForJob.mockReset();
    surfaceProvidersApi.resolveOpenRouterStructuredChatExtrasForJob.mockReturnValue(null);
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
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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
    expect(typeof j?.metadata?.debugMarkdown).toBe('string');
    expect(String(j?.metadata?.debugMarkdown)).toContain('# Abyss Pipeline Failure');
    expect(String(j?.metadata?.debugMarkdown)).toContain('parse failed');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const first = String(consoleSpy.mock.calls[0]?.[0] ?? '');
    expect(first).toContain('[abyss:pipeline-failed]');
    expect(first).toContain('# Abyss Pipeline Failure');

    consoleSpy.mockRestore();
  });

  it('finishes aborted when external signal aborts', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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
    const pipelineFailedLogged = consoleSpy.mock.calls.some((c) =>
      String(c[0]).includes('[abyss:pipeline-failed]'),
    );
    expect(pipelineFailedLogged).toBe(false);
    consoleSpy.mockRestore();
  });

  it('preserves requested reasoning in structured OpenRouter requests', async () => {
    surfaceProvidersApi.resolveIncludeOpenRouterReasoningParam.mockReturnValue(true);
    surfaceProvidersApi.resolveOpenRouterStructuredChatExtrasForJob.mockReturnValue({
      responseFormat: { type: 'json_object' },
      plugins: [{ id: 'response-healing' }],
      forceNonStreaming: true,
      providerHealingRequested: true,
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
      enableReasoning: true,
      enableStreaming: false,
      responseFormat: { type: 'json_object' },
      plugins: [{ id: 'response-healing' }],
    }));
  });

  it('forwards JSON Schema override to the structured extras resolver', async () => {
    surfaceProvidersApi.resolveOpenRouterStructuredChatExtrasForJob.mockReturnValue(null);

    const streamChat = vi.fn(async function* stream() {
      yield { type: 'content' as const, text: '{}' };
    });
    const chat: Pick<IChatCompletionsRepository, 'streamChat'> = { streamChat };

    const schemaFormat = {
      type: 'json_schema' as const,
      json_schema: {
        name: 'topic_theory_syllabus',
        strict: true,
        schema: { type: 'object' },
      },
    };

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
      enableReasoning: false,
      responseFormatOverride: schemaFormat,
      parseOutput: async () => ({ ok: true, data: 42 }),
      persistOutput: vi.fn(),
    });

    expect(surfaceProvidersApi.resolveOpenRouterStructuredChatExtrasForJob).toHaveBeenCalledWith(
      'topicContent',
      { jsonSchemaResponseFormat: schemaFormat },
    );
  });

  it('passes JSON Schema response_format to streamChat when the resolver selects it', async () => {
    const schemaFormat = {
      type: 'json_schema' as const,
      json_schema: {
        name: 'topic_theory_syllabus',
        strict: true,
        schema: { type: 'object', additionalProperties: true },
      },
    };

    surfaceProvidersApi.resolveOpenRouterStructuredChatExtrasForJob.mockReturnValue({
      responseFormat: schemaFormat,
      plugins: undefined,
      forceNonStreaming: true,
      providerHealingRequested: false,
    });

    const streamChat = vi.fn(async function* stream() {
      yield { type: 'content' as const, text: '{}' };
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
      enableReasoning: false,
      responseFormatOverride: schemaFormat,
      parseOutput: async () => ({ ok: true, data: 42 }),
      persistOutput: vi.fn(),
    });

    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: schemaFormat,
        enableStreaming: false,
      }),
    );

    const jobs = Object.values(useContentGenerationStore.getState().jobs);
    expect(jobs[0]?.metadata).toMatchObject({
      structuredOutputMode: 'json_schema',
      structuredOutputSchemaName: 'topic_theory_syllabus',
      providerHealingRequested: false,
    });
  });

  it('records providerHealingRequested whenever resolver returns extras (Phase 0 step 7)', async () => {
    // Plan v3 Q22: record the request, not the structured-output mode. Even in
    // legacy permissive json_object mode, the metadata must mirror the resolver
    // flag (lockstep with `plugins` presence) so durable Worker telemetry can
    // consume it without re-deriving.
    surfaceProvidersApi.resolveOpenRouterStructuredChatExtrasForJob.mockReturnValue({
      responseFormat: { type: 'json_object' },
      plugins: [{ id: 'response-healing' }],
      forceNonStreaming: true,
      providerHealingRequested: true,
    });

    const streamChat = vi.fn(async function* stream() {
      yield { type: 'content' as const, text: '{}' };
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
      enableReasoning: false,
      parseOutput: async () => ({ ok: true, data: 42 }),
      persistOutput: vi.fn(),
    });

    const j = Object.values(useContentGenerationStore.getState().jobs)[0];
    expect(j?.metadata).toMatchObject({
      providerHealingRequested: true,
    });
    // Should NOT carry json_schema-only metadata because the resolver returned
    // json_object mode.
    expect((j?.metadata as Record<string, unknown> | undefined)?.structuredOutputMode).toBeUndefined();
  });

  it('merges structured-output contract violation metadata when json_schema parse fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const schemaFormat = {
      type: 'json_schema' as const,
      json_schema: {
        name: 'topic_theory_syllabus',
        strict: true,
        schema: { type: 'object', additionalProperties: true },
      },
    };

    surfaceProvidersApi.resolveOpenRouterStructuredChatExtrasForJob.mockReturnValue({
      responseFormat: schemaFormat,
      plugins: [{ id: 'response-healing' }],
      forceNonStreaming: true,
      providerHealingRequested: true,
    });

    const streamChat = vi.fn(async function* stream() {
      yield { type: 'content' as const, text: '{}' };
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
      enableReasoning: false,
      responseFormatOverride: schemaFormat,
      parseOutput: async () => ({ ok: false, error: 'bad parse', parseError: 'bad parse' }),
      persistOutput: vi.fn(),
    });

    const j = Object.values(useContentGenerationStore.getState().jobs)[0];
    expect(j?.metadata).toMatchObject({
      structuredOutputContractViolation: true,
      structuredOutputMode: 'json_schema',
      structuredOutputSchemaName: 'topic_theory_syllabus',
      localParserError: 'bad parse',
      providerHealingRequested: true,
    });

    consoleSpy.mockRestore();
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
