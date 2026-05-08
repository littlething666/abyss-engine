/**
 * OpenRouter client tests — Phase 1 PR-D.
 *
 * Tests the server-side `callCrystalTrial` with mocked `fetch`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { callOpenRouterChat, callCrystalTrial, callTopicExpansion, callSubjectGraph, callTopicContent } from '../llm/openrouterClient';
import type { Env } from '../env';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const testEnv: Env = {
  OPENROUTER_API_KEY: 'sk-or-test',
  ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
};

function makeResponseFormat(name: string, schema: Record<string, unknown>) {
  return {
    type: 'json_schema' as const,
    json_schema: { name, strict: true as const, schema },
  };
}

const testArgs = {
  modelId: 'google/gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Generate trial questions.' }],
  responseFormat: makeResponseFormat('crystal_trial', { type: 'object', properties: { questions: { type: 'array' } } }),
  providerHealingRequested: true,
};

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

describe('callOpenRouterChat', () => {
  it('builds the canonical shared request body without leaking jobKind', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{}' } }],
      usage: null,
    });

    await callOpenRouterChat({ ...testArgs, jobKind: 'subject-graph', temperature: 0.25 }, testEnv);

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toBe(testArgs.modelId);
    expect(body.messages).toEqual(testArgs.messages);
    expect(body.response_format).toEqual(testArgs.responseFormat);
    expect(body.plugins).toEqual([{ id: 'response-healing' }]);
    expect(body.usage).toEqual({ include: true });
    expect(body.temperature).toBe(0.25);
    expect(body.jobKind).toBeUndefined();
    expect(body.stream).toBeUndefined();
  });

  it('fails loudly when the OpenRouter response wrapper is malformed', async () => {
    mockFetch(200, { choices: null });

    await expect(
      callOpenRouterChat({ ...testArgs, jobKind: 'crystal-trial' }, testEnv),
    ).rejects.toMatchObject({
      code: 'parse:zod-shape',
      message: 'invalid OpenRouter response wrapper for crystal-trial',
    });
  });

  it('fails loudly when OpenRouter usage accounting is malformed', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{}' } }],
      usage: { prompt_tokens: 1, completion_tokens: '2', total_tokens: 3 },
    });

    await expect(
      callOpenRouterChat({ ...testArgs, jobKind: 'topic-content' }, testEnv),
    ).rejects.toMatchObject({
      code: 'parse:zod-shape',
      message: 'invalid OpenRouter usage wrapper for topic-content',
    });
  });
});

describe('callCrystalTrial', () => {
  it('returns text and usage on success', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{"questions":[]}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const result = await callCrystalTrial(testArgs, testEnv);
    expect(result.text).toBe('{"questions":[]}');
    expect(result.usage?.total_tokens).toBe(15);
  });

  it('sets response_format to json_schema with strict', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{}' } }],
      usage: null,
    });

    await callCrystalTrial(testArgs, testEnv);

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('sends ASCII-safe OpenRouter attribution headers', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{}' } }],
      usage: null,
    });

    await callCrystalTrial(testArgs, testEnv);

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = fetchCall[1].headers as Record<string, string>;
    expect(headers['x-title']).toBe('Abyss Engine Durable Orchestrator');
    expect(/^[\x00-\x7F]*$/.test(headers['x-title'])).toBe(true);
  });

  it('includes response-healing plugin when requested', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{}' } }],
      usage: null,
    });

    await callCrystalTrial({ ...testArgs, providerHealingRequested: true }, testEnv);

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.plugins).toEqual([{ id: 'response-healing' }]);
  });

  it('omits response-healing when not requested', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{}' } }],
      usage: null,
    });

    await callCrystalTrial({ ...testArgs, providerHealingRequested: false }, testEnv);

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.plugins).toBeUndefined();
  });

  it('throws WorkflowFail on 429', async () => {
    mockFetch(429, {});

    await expect(callCrystalTrial(testArgs, testEnv)).rejects.toThrow('openrouter 429');
  });

  it('throws WorkflowFail on 5xx', async () => {
    mockFetch(503, {});

    await expect(callCrystalTrial(testArgs, testEnv)).rejects.toThrow('openrouter 503');
  });

  it('includes OpenRouter error response body on non-OK responses', async () => {
    mockFetch(400, {
      error: {
        message: 'Provider rejected json_schema',
        code: 400,
      },
    });

    await expect(callCrystalTrial(testArgs, testEnv)).rejects.toMatchObject({
      code: 'llm:upstream-5xx',
      message: 'openrouter 400: {"error":{"message":"Provider rejected json_schema","code":400}}',
    });
  });

  it('throws WorkflowFail when model returns no content', async () => {
    mockFetch(200, { choices: [{ message: {} }] });

    await expect(callCrystalTrial(testArgs, testEnv)).rejects.toThrow('missing assistant content');
  });

  it('throws WorkflowFail when OPENROUTER_API_KEY is missing', async () => {
    mockFetch(200, { choices: [{ message: { content: '{}' } }] });

    await expect(
      callCrystalTrial(testArgs, { ...testEnv, OPENROUTER_API_KEY: '' }),
    ).rejects.toThrow('missing OPENROUTER_API_KEY');
  });
});

// ── Phase 2: Topic Expansion caller ──────────────────────────────
describe('callTopicExpansion', () => {
  const expansionArgs = {
    modelId: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content: 'Generate expansion cards.' }],
    responseFormat: makeResponseFormat('topic_expansion', { type: 'object', properties: { cards: { type: 'array' } } }),
    providerHealingRequested: true,
  };

  it('returns text and usage on success', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{"cards":[]}' } }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    });

    const result = await callTopicExpansion(expansionArgs, testEnv);
    expect(result.text).toBe('{"cards":[]}');
    expect(result.usage?.total_tokens).toBe(30);
  });

  it('uses contract-owned response format with topic_expansion name', async () => {
    mockFetch(200, { choices: [{ message: { content: '{}' } }], usage: null });
    await callTopicExpansion(expansionArgs, testEnv);

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.response_format.json_schema.name).toBe('topic_expansion');
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('throws WorkflowFail on 429', async () => {
    mockFetch(429, {});
    await expect(callTopicExpansion(expansionArgs, testEnv)).rejects.toThrow('openrouter 429');
  });

  it('throws WorkflowFail on 5xx', async () => {
    mockFetch(503, {});
    await expect(callTopicExpansion(expansionArgs, testEnv)).rejects.toThrow('openrouter 503');
  });
});

// ── Phase 2: Subject Graph caller ──────────────────────────────────
describe('callSubjectGraph', () => {
  const sgArgs = {
    modelId: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content: 'Generate topic lattice.' }],
    responseFormat: makeResponseFormat('subject_graph', { type: 'object', properties: { topics: { type: 'array' } } }),
    providerHealingRequested: true,
  };

  it('returns text and usage on success', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{"topics":[]}' } }],
      usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45 },
    });

    const result = await callSubjectGraph(sgArgs, testEnv);
    expect(result.text).toBe('{"topics":[]}');
    expect(result.usage?.total_tokens).toBe(45);
  });

  it('includes temperature when specified', async () => {
    mockFetch(200, { choices: [{ message: { content: '{}' } }], usage: null });
    await callSubjectGraph({ ...sgArgs, temperature: 0.1 }, testEnv);

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.temperature).toBe(0.1);
  });

  it('omits temperature when not specified', async () => {
    mockFetch(200, { choices: [{ message: { content: '{}' } }], usage: null });
    await callSubjectGraph(sgArgs, testEnv);

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.temperature).toBeUndefined();
  });
});

// ── Phase 2: Topic Content caller ──────────────────────────────────
describe('callTopicContent', () => {
  const tcArgs = {
    modelId: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content: 'Generate theory.' }],
    responseFormat: makeResponseFormat('topic_content_theory', { type: 'object', properties: { coreConcept: { type: 'string' } } }),
    providerHealingRequested: true,
    stage: 'theory',
  };

  it('returns text and usage on success', async () => {
    mockFetch(200, {
      choices: [{ message: { content: '{"coreConcept":"test"}' } }],
      usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
    });

    const result = await callTopicContent(tcArgs, testEnv);
    expect(result.text).toBe('{"coreConcept":"test"}');
    expect(result.usage?.total_tokens).toBe(60);
  });

  it('includes stage in schema name', async () => {
    mockFetch(200, { choices: [{ message: { content: '{}' } }], usage: null });
    await callTopicContent(tcArgs, testEnv);

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.response_format.json_schema.name).toBe('topic_content_theory');
  });

  it('uses response format name directly', async () => {
    mockFetch(200, { choices: [{ message: { content: '{}' } }], usage: null });
    const miniArgs = {
      ...tcArgs,
      stage: 'mini-games:CATEGORY_SORT',
      responseFormat: makeResponseFormat('topic_mini_game_category_sort', {}),
    };
    await callTopicContent(miniArgs, testEnv);

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.response_format.json_schema.name).toBe('topic_mini_game_category_sort');
  });

  it('throws WorkflowFail on 429', async () => {
    mockFetch(429, {});
    await expect(callTopicContent(tcArgs, testEnv)).rejects.toThrow('openrouter 429');
  });
});
