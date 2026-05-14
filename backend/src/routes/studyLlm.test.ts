import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../env';
import { studyLlm } from './studyLlm';

const { callLlmStudyStreamMock } = vi.hoisted(() => ({
  callLlmStudyStreamMock: vi.fn(),
}));

vi.mock('../llm/llmClient', () => ({
  callLlmStudyStream: callLlmStudyStreamMock,
}));

function testApp() {
  const app = new Hono<{ Bindings: Env; Variables: { deviceId: string } }>();
  app.use('/v1/*', async (c, next) => {
    const deviceId = c.req.header('x-abyss-device');
    if (!deviceId) return c.json({ error: 'missing_header' }, 400);
    c.set('deviceId', deviceId);
    await next();
  });
  app.route('/v1', studyLlm);
  return app;
}

async function responseText(response: Response): Promise<string> {
  return response.text();
}

describe('studyLlm route', () => {
  beforeEach(() => {
    callLlmStudyStreamMock.mockReset();
  });

  it('requires X-Abyss-Device at the v1 boundary', async () => {
    const res = await testApp().request('/v1/study-llm/stream', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'study-question-explain',
        intent: { topicLabel: 'T', questionText: 'Q', agentPersonality: 'A' },
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing_header' });
  });

  it('rejects browser-supplied provider fields', async () => {
    const res = await testApp().request('/v1/study-llm/stream', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'study-question-explain',
        model: 'browser-model',
        intent: { topicLabel: 'T', questionText: 'Q', agentPersonality: 'A' },
      }),
      headers: {
        'content-type': 'application/json',
        'x-abyss-device': '00000000-0000-4000-8000-000000000000',
      },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'provider_field_forbidden' });
    expect(callLlmStudyStreamMock).not.toHaveBeenCalled();
  });

  it('streams normalized content and reasoning events from backend policy-owned call', async () => {
    callLlmStudyStreamMock.mockResolvedValue((async function* () {
      yield { type: 'reasoning', text: 'plan' };
      yield { type: 'content', text: 'answer' };
    })());

    const res = await testApp().request('/v1/study-llm/stream', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'study-formula-explain',
        intent: {
          topicLabel: 'T',
          cardQuestionText: 'Q',
          latex: 'x^2',
          context: 'question',
        },
      }),
      headers: {
        'content-type': 'application/json',
        'x-abyss-device': '00000000-0000-4000-8000-000000000000',
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(await responseText(res)).toBe(
      'data: {"type":"reasoning","text":"plan"}\n\n'
        + 'data: {"type":"content","text":"answer"}\n\n'
        + 'data: {"type":"done"}\n\n',
    );
    expect(callLlmStudyStreamMock).toHaveBeenCalledTimes(1);
    expect(callLlmStudyStreamMock.mock.calls[0][0]).toMatchObject({
      modelId: expect.any(String),
      requestReasoning: true,
      messages: expect.any(Array),
    });
  });

  it('accepts question explanation intent and sends backend-built messages', async () => {
    callLlmStudyStreamMock.mockResolvedValue((async function* () {
      yield { type: 'content', text: 'answer' };
    })());

    const res = await testApp().request('/v1/study-llm/stream', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'study-question-explain',
        intent: {
          topicLabel: 'Derivatives',
          questionText: 'What is slope?',
          agentPersonality: 'Be concise.',
        },
      }),
      headers: {
        'content-type': 'application/json',
        'x-abyss-device': '00000000-0000-4000-8000-000000000000',
      },
    });

    expect(res.status).toBe(200);
    const args = callLlmStudyStreamMock.mock.calls[0][0];
    expect(args.messages[0].content).toContain('Derivatives');
    expect(args.messages[0].content).toContain('What is slope?');
    expect(args.messages[0].content).toContain('Be concise.');
  });
});
