import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { ChatMessage, ChatStreamChunk } from '../../types/llm';
import {
  HttpChatCompletionsRepository,
  withUserMessageIfMissing,
} from './HttpChatCompletionsRepository';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function delayFnImmediate(): Mock<(ms: number, signal: AbortSignal | undefined) => Promise<void>> {
  return vi.fn(async () => {});
}

describe('withUserMessageIfMissing', () => {
  it('appends a user message when none present', () => {
    const onlySystem: ChatMessage[] = [{ role: 'system', content: 'You are helpful.' }];
    const out = withUserMessageIfMissing(onlySystem);
    expect(out).toHaveLength(2);
    expect(out[1].role).toBe('user');
  });
  it('leaves messages alone when a user role exists', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    expect(withUserMessageIfMissing(messages)).toBe(messages);
  });
});

describe('HttpChatCompletionsRepository', () => {
  it('returns assistant content on success', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Hello learner' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat/completions', 'm1');
    const result = await repo.completeChat({ model: 'm1', messages: [{ role: 'user', content: 'Hi' }] });
    expect(result.content).toBe('Hello learner');
    expect(result.reasoningDetails).toBeNull();
  });

  it('returns reasoning_details text when present', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'The answer', reasoning_details: [{ type: 'reasoning.text', text: 'Thinking...' }] } }],
      }),
    })) as unknown as typeof fetch;
    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    const result = await repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
    expect(result.reasoningDetails).toBe('Thinking...');
  });

  it('returns raw reasoning_details item when item type is unrecognized', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Final',
              reasoning_details: [
                {
                  type: 'reasoning.unknown',
                  marker: 'untrusted',
                  sequence: 1,
                },
              ],
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    const result = await repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
    expect(result.reasoningDetails).toBe(
      JSON.stringify({
        type: 'reasoning.unknown',
        marker: 'untrusted',
        sequence: 1,
      }),
    );
  });

  it('sends reasoning enabled when includeOpenRouterReasoning is true', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    await repo.completeChat({
      model: 'm',
      messages: [{ role: 'user', content: 'a' }],
      includeOpenRouterReasoning: true,
      enableReasoning: true,
    });
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string);
    expect(body.reasoning).toEqual({ enabled: true });
  });

  it('sends Authorization when api key is set', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm', 'secret');
    await repo.completeChat({ model: 'x', messages: [{ role: 'user', content: 'a' }] });
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/chat',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      }),
    );
  });

  it('omits Authorization when api key is null', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://worker.example.workers.dev/chat/completions', 'm', null);
    await repo.completeChat({ model: 'x', messages: [{ role: 'user', content: 'a' }] });
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!;
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('yields streamed delta content (SSE)', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n'
      + 'data: {"choices":[{"delta":{"content":"lo"}}]}\n'
      + 'data: [DONE]\n';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        },
      }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    const parts: ChatStreamChunk[] = [];
    for await (const p of repo.streamChat({ model: 'm', messages: [{ role: 'user', content: 'a' }] })) {
      parts.push(p);
    }
    expect(parts.map((c) => c.text).join('')).toBe('Hello');
  });

  it('includes temperature on completeChat when provided', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    await repo.completeChat({
      model: 'm',
      messages: [{ role: 'user', content: 'a' }],
      temperature: 0.2,
    });
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string);
    expect(body.temperature).toBe(0.2);
  });

  it('includes response_format and plugins on completeChat when provided', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    await repo.completeChat({
      model: 'm',
      messages: [{ role: 'user', content: 'a' }],
      responseFormat: { type: 'json_object' },
      plugins: [{ id: 'response-healing' }],
    });
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(false);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.plugins).toEqual([{ id: 'response-healing' }]);
  });

  it('forwards json_schema response_format unchanged on completeChat when provided', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    })) as unknown as typeof fetch;

    const schemaFormat = {
      type: 'json_schema' as const,
      json_schema: {
        name: 'topic_theory_syllabus',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { coreConcept: { type: 'string' } },
        },
      },
    };

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    await repo.completeChat({
      model: 'm',
      messages: [{ role: 'user', content: 'a' }],
      responseFormat: schemaFormat,
    });
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual(schemaFormat);
  });

  it('includes tools and exposes provider metadata on completeChat', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        usage: { server_tool_use: { web_search_requests: 1 } },
        citations: ['https://example.edu/source'],
        choices: [{ message: { content: '{}', annotations: [{ url: 'https://example.edu/source' }] } }],
      }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    const result = await repo.completeChat({
      model: 'm',
      messages: [{ role: 'user', content: 'a' }],
      tools: [{ type: 'openrouter:web_search', parameters: { engine: 'firecrawl', max_results: 3, max_total_results: 5 } }],
    });
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string);
    expect(body.tools).toEqual([
      { type: 'openrouter:web_search', parameters: { engine: 'firecrawl', max_results: 3, max_total_results: 5 } },
    ]);
    expect(result.providerMetadata?.usage).toEqual({ server_tool_use: { web_search_requests: 1 } });
    expect(result.providerMetadata?.annotations).toEqual([{ url: 'https://example.edu/source' }]);
    expect(result.providerMetadata?.citations).toEqual(['https://example.edu/source']);
  });

  it('falls back to completeChat when streaming disabled', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Direct', reasoning_details: [{ type: 'reasoning.text', text: 'Think' }] } }],
      }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    const parts: ChatStreamChunk[] = [];
    for await (const p of repo.streamChat({
      model: 'm',
      messages: [{ role: 'user', content: 'a' }],
      enableStreaming: false,
    })) {
      parts.push(p);
    }

    expect(parts).toEqual([
      { type: 'reasoning', text: 'Think' },
      { type: 'content', text: 'Direct' },
    ]);
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!;
    expect(JSON.parse(init.body).stream).toBe(false);
  });

  describe('OpenRouter transient retry', () => {
    it('retries once on 502 then succeeds (completeChat)', async () => {
      const delayFn = delayFnImmediate();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          text: async () => 'bad gateway',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
        }) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository(
        'https://worker.example/chat/completions',
        'm',
        null,
        true,
        delayFn,
      );
      const result = await repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'Hi' }] });
      expect(result.content).toBe('ok');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(delayFn).toHaveBeenCalledTimes(1);
      expect(delayFn).toHaveBeenCalledWith(500, undefined);
    });

    it.each([503, 504] as const)('retries on %s then succeeds', async (status) => {
      const delayFn = delayFnImmediate();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status,
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'y' } }] }),
        }) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository('https://w/chat/completions', 'm', null, true, delayFn);
      const result = await repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
      expect(result.content).toBe('y');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(delayFn).toHaveBeenCalledWith(500, undefined);
    });

    it('does NOT retry on 500', async () => {
      const delayFn = delayFnImmediate();
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'err',
      })) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository('https://w/chat/completions', 'm', null, true, delayFn);
      await expect(repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
        'Chat completion failed (500)',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(delayFn).not.toHaveBeenCalled();
    });

    it.each([400, 401, 404] as const)('does NOT retry on %s', async (status) => {
      const delayFn = delayFnImmediate();
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status,
        text: async () => 'nope',
      })) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository('https://w/chat/completions', 'm', null, true, delayFn);
      await expect(repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
        `Chat completion failed (${status})`,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(delayFn).not.toHaveBeenCalled();
    });

    it('gives up after exhausting retries and throws existing error format', async () => {
      const delayFn = delayFnImmediate();
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        text: async () => '',
      })) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository('https://w/chat/completions', 'm', null, true, delayFn);
      await expect(repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
        'Chat completion failed (502)',
      );
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(delayFn).toHaveBeenCalledTimes(3);
      expect(delayFn.mock.calls.map((c) => c[0])).toEqual([500, 1_000, 2_000]);
    });

    it('does NOT retry when isRetryEligible is false (local default)', async () => {
      const delayFn = delayFnImmediate();
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        text: async () => '',
      })) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository('https://w/chat/completions', 'm', null, false, delayFn);
      await expect(repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
        'Chat completion failed (502)',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(delayFn).not.toHaveBeenCalled();
    });

    it('streamChat retries pre-stream on 502 then streams', async () => {
      const delayFn = delayFnImmediate();
      const sse =
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n' + 'data: [DONE]\n';
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(sse));
              controller.close();
            },
          }),
        }) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository('https://w/chat/completions', 'm', null, true, delayFn);
      const parts: ChatStreamChunk[] = [];
      for await (const p of repo.streamChat({ model: 'm', messages: [{ role: 'user', content: 'a' }] })) {
        parts.push(p);
      }
      expect(parts.map((c) => c.text).join('')).toBe('Hi');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(delayFn).toHaveBeenCalledWith(500, undefined);
    });

    it('streamChat does NOT retry after first chunk (reader error)', async () => {
      const delayFn = delayFnImmediate();
      const sse = 'data: {"choices":[{"delta":{"content":"X"}}]}\n';
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        body: {
          getReader: () => {
            let n = 0;
            return {
              read: async () => {
                n += 1;
                if (n === 1) {
                  return { done: false, value: new TextEncoder().encode(sse) };
                }
                throw new Error('simulated read failure');
              },
              releaseLock: () => {},
            };
          },
        },
      })) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository('https://w/chat/completions', 'm', null, true, delayFn);
      await expect(async () => {
        for await (const _ of repo.streamChat({ model: 'm', messages: [{ role: 'user', content: 'a' }] })) {
          /* drain */
        }
      }).rejects.toThrow('simulated read failure');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(delayFn).not.toHaveBeenCalled();
    });

    it('respects AbortSignal during retry sleep', async () => {
      const ac = new AbortController();
      const delayFn = vi.fn(
        (_ms: number, signal: AbortSignal | undefined) =>
          new Promise<void>((resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              }, { once: true });
            } else {
              resolve();
            }
          }),
      );
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        text: async () => '',
      })) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository('https://w/chat/completions', 'm', null, true, delayFn);
      const p = repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }], signal: ac.signal });
      for (let i = 0; i < 5 && delayFn.mock.calls.length === 0; i++) {
        await Promise.resolve();
      }
      expect(delayFn).toHaveBeenCalledTimes(1);
      ac.abort();
      await expect(p).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('respects AbortSignal between retries (pre-sleep)', async () => {
      const ac = new AbortController();
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        text: async () => {
          ac.abort();
          return '';
        },
      })) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository('https://w/chat/completions', 'm', null, true);
      await expect(
        repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }], signal: ac.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('drains failed body before retrying (text called once per failed attempt)', async () => {
      const delayFn = delayFnImmediate();
      const textSpy = vi.fn().mockResolvedValue('');
      const make502 = () =>
        ({
          ok: false,
          status: 502,
          text: textSpy,
        }) as unknown as Response;

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(make502())
        .mockResolvedValueOnce(make502())
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'done' } }] }),
        }) as unknown as typeof fetch;

      const repo = new HttpChatCompletionsRepository('https://w/chat/completions', 'm', null, true, delayFn);
      await repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
      expect(textSpy).toHaveBeenCalledTimes(2);
    });
  });
});
