import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../../types/llm';
import { HttpChatCompletionsRepository } from './HttpChatCompletionsRepository';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
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
    const text = await repo.completeChat({
      model: 'm1',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(text).toBe('Hello learner');
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
    const parts: string[] = [];
    for await (const p of repo.streamChat({ model: 'm', messages: [multimodalMessage] })) {
      parts.push(p);
    }
    expect(parts.join('')).toBe('ok');
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body.messages[0].content).toEqual(multimodalMessage.content);
    expect(body.stream).toBe(true);
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
    const parts: string[] = [];
    for await (const p of repo.streamChat({ model: 'm', messages: [{ role: 'user', content: 'a' }] })) {
      parts.push(p);
    }
    expect(parts.join('')).toBe('Hello');
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(body.stream).toBe(true);
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
      const parts: string[] = [];
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
