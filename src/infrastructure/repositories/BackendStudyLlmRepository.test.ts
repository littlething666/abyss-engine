import { describe, expect, it, vi } from 'vitest';

import { BackendStudyLlmRepository } from './BackendStudyLlmRepository';

function streamResponse(body: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

describe('BackendStudyLlmRepository', () => {
  it('posts compact study intent with only durable Worker headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"type":"content","text":"hello"}\n\ndata: {"type":"done"}\n\n'),
    );
    const repo = new BackendStudyLlmRepository({
      baseUrl: 'https://worker.example/',
      deviceId: '00000000-0000-4000-8000-000000000000',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const chunks = [];
    for await (const chunk of repo.stream({
      kind: 'study-question-explain',
      intent: {
        topicLabel: 'Vectors',
        questionText: 'What is dot product?',
        agentPersonality: 'Concise',
      },
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ type: 'content', text: 'hello' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://worker.example/v1/study-llm/stream');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Abyss-Device': '00000000-0000-4000-8000-000000000000',
    });
    expect(JSON.parse(init.body)).toEqual({
      kind: 'study-question-explain',
      intent: {
        topicLabel: 'Vectors',
        questionText: 'What is dot product?',
        agentPersonality: 'Concise',
      },
    });
    expect(init.body).not.toMatch(/model|messages|response_format|plugins|tools|enableReasoning/);
  });

  it('normalizes backend content and reasoning SSE events', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse(
        'data: {"type":"reasoning","text":"plan"}\n\n'
          + 'data: {"type":"content","text":"answer"}\n\n'
          + 'data: {"type":"done"}\n\n',
      ),
    );
    const repo = new BackendStudyLlmRepository({
      baseUrl: 'https://worker.example',
      deviceId: '00000000-0000-4000-8000-000000000000',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const chunks = [];
    for await (const chunk of repo.stream({
      kind: 'study-formula-explain',
      intent: {
        topicLabel: 'Calculus',
        cardQuestionText: 'Differentiate x^2',
        latex: 'x^2',
        context: 'question',
      },
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'reasoning', text: 'plan' },
      { type: 'content', text: 'answer' },
    ]);
  });
});
