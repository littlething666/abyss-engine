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
    expect(result.reasoningContent).toBeNull();
  });

  it('returns reasoning_content when present', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'The answer', reasoning_content: 'Thinking...' } }] }),
    })) as unknown as typeof fetch;
    const repo = new HttpChatCompletionsRepository('https://example.com/chat', 'm');
    const result = await repo.completeChat({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
    expect(result.reasoningContent).toBe('Thinking...');
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

  it('falls back to completeChat when streaming disabled', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Direct', reasoning_content: 'Think' } }] }),
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
});
