import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('withUserMessageIfMissing', () => {
  it('appends a user message when none present', () => {
    const onlySystem: ChatMessage[] = [{ role: 'system', content: 'You are helpful.' }];
    const out = withUserMessageIfMissing(onlySystem);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(onlySystem[0]);
    expect(out[1]).toEqual({
      role: 'user',
      content: 'Follow the instructions above and respond.',
    });
  });

  it('does not copy when a user message already exists', () => {
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
      json: async () => ({
        choices: [{ message: { content: 'Hello learner' } }],
      }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/v1/chat/completions', 'm1');
    const result = await repo.completeChat({
      model: 'm1',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(result.content).toBe('Hello learner');
    expect(result.reasoningContent).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('completeChat appends a user message when only system (or assistant) roles are present', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    await repo.completeChat({
      model: 'm',
      messages: [{ role: 'system', content: 'Instructions only.' }],
    });
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Instructions only.' },
      { role: 'user', content: 'Follow the instructions above and respond.' },
    ]);
  });

  it('returns reasoning_content when present', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: 'The answer is 42.',
            reasoning_content: 'Let me think step by step...',
          },
        }],
      }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    const result = await repo.completeChat({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(result.content).toBe('The answer is 42.');
    expect(result.reasoningContent).toBe('Let me think step by step...');
  });

  it('sends enable_thinking when specified', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    await repo.completeChat({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      enableThinking: true,
    });
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body.enable_thinking).toBe(true);
  });

  it('omits enable_thinking when undefined', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    await repo.completeChat({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
    });
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body).not.toHaveProperty('enable_thinking');
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret',
        },
      }),
    );
  });

  it('completeChat uses per-request apiKey and endpointUrl overrides', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://default.example/chat', 'm', 'constructor');
    await repo.completeChat({
      model: 'm',
      messages: [{ role: 'user', content: 'a' }],
      endpointUrl: 'https://override.example/v1/chat/completions',
      apiKey: 'override-token',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://override.example/v1/chat/completions',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer override-token',
        },
      }),
    );
  });

  it('uses default model when input model is empty', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'fallback');
    await repo.completeChat({ model: '', messages: [{ role: 'user', content: 'a' }] });
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body.model).toBe('fallback');
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => 'overloaded',
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    await expect(
      repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'a' }] }),
    ).rejects.toThrow(/503/);
  });

  it('throws when choices content is missing', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{}] }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    await expect(
      repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'a' }] }),
    ).rejects.toThrow(/missing assistant message content/);
  });

  it('serializes multimodal user content in stream request body', async () => {
    const multimodalMessage: ChatMessage = {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ],
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"ok"}}]}\n' + 'data: [DONE]\n',
            ),
          );
          controller.close();
        },
      }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    const parts: ChatStreamChunk[] = [];
    for await (const p of repo.streamChat({ model: 'm', messages: [multimodalMessage] })) {
      parts.push(p);
    }
    expect(parts.map((c) => c.text).join('')).toBe('ok');
    expect(parts[0].type).toBe('content');
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body.messages[0].content).toEqual(multimodalMessage.content);
    expect(body.stream).toBe(true);
  });

  it('streamChat appends a user message when no user role is present', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"done"}}]}\n'
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
    for await (const _ of repo.streamChat({
      model: 'm',
      messages: [{ role: 'system', content: 'Sys only.' }],
    })) {
      /* drain */
    }
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Sys only.' },
      { role: 'user', content: 'Follow the instructions above and respond.' },
    ]);
  });

  it('yields streamed delta content (OpenAI-style SSE)', async () => {
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
    expect(parts.every((c) => c.type === 'content')).toBe(true);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body.stream).toBe(true);
  });

  it('streamChat uses per-request apiKey and endpointUrl overrides', async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"x"}}]}\n' + 'data: [DONE]\n';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        },
      }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://default.example/chat', 'm', 'constructor-key');
    const parts: ChatStreamChunk[] = [];
    for await (const p of repo.streamChat({
      model: 'm',
      messages: [{ role: 'user', content: 'a' }],
      endpointUrl: 'https://override.example/v1/chat/completions',
      apiKey: 'override-key',
    })) {
      parts.push(p);
    }
    expect(parts.map((c) => c.text).join('')).toBe('x');
    expect(fetch).toHaveBeenCalledWith(
      'https://override.example/v1/chat/completions',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer override-key',
        },
      }),
    );
  });

  it('yields reasoning_content chunks separately from content chunks', async () => {
    const sse =
      'data: {"choices":[{"delta":{"reasoning_content":"Let me"}}]}\n'
      + 'data: {"choices":[{"delta":{"reasoning_content":" think..."}}]}\n'
      + 'data: {"choices":[{"delta":{"content":"The answer"}}]}\n'
      + 'data: {"choices":[{"delta":{"content":" is 42."}}]}\n'
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
    const chunks: ChatStreamChunk[] = [];
    for await (const c of repo.streamChat({ model: 'm', messages: [{ role: 'user', content: 'a' }] })) {
      chunks.push(c);
    }
    const reasoning = chunks.filter((c) => c.type === 'reasoning').map((c) => c.text).join('');
    const content = chunks.filter((c) => c.type === 'content').map((c) => c.text).join('');
    expect(reasoning).toBe('Let me think...');
    expect(content).toBe('The answer is 42.');
  });

  it('sends enable_thinking in stream request body', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n'
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
    for await (const _ of repo.streamChat({
      model: 'm',
      messages: [{ role: 'user', content: 'a' }],
      enableThinking: true,
    })) {
      /* drain */
    }
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body.enable_thinking).toBe(true);
  });

  it('throws when stream ends with no content', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n'));
          controller.close();
        },
      }),
    })) as unknown as typeof fetch;

    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    const collect = async () => {
      const parts: ChatStreamChunk[] = [];
      for await (const p of repo.streamChat({ model: 'm', messages: [{ role: 'user', content: 'a' }] })) {
        parts.push(p);
      }
      return parts;
    };
    await expect(collect()).rejects.toThrow(/no assistant content/);
  });

  it('passes AbortSignal to fetch for streaming', async () => {
    globalThis.fetch = vi.fn(async (_url, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return {
        ok: true,
        body: new ReadableStream({
          start() {
            /* unused */
          },
        }),
      };
    }) as unknown as typeof fetch;

    const ac = new AbortController();
    ac.abort();
    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    await expect(
      (async () => {
        for await (const _ of repo.streamChat({
          model: 'm',
          messages: [{ role: 'user', content: 'a' }],
          signal: ac.signal,
        })) {
          /* drain */
        }
      })(),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/chat',
      expect.objectContaining({ signal: ac.signal }),
    );
  });
});
