import { Hono } from 'hono';

import type { Env } from '../env';
import { WorkflowFail } from '../lib/workflowErrors';
import { callOpenRouterStudyStream } from '../llm/openrouterClient';
import { buildStudyLlmMessages } from '../studyLlm/studyLlmPrompts';
import { resolveStudyLlmPolicy } from '../studyLlm/studyLlmPolicy';
import { encodeStudyLlmSseEvent } from '../studyLlm/studyLlmStream';
import { StudyLlmValidationError, validateStudyLlmRequest } from '../studyLlm/studyLlmValidation';

function workflowStatus(code: string): 400 | 429 | 500 | 502 {
  if (code.startsWith('validation:') || code.startsWith('parse:')) return 400;
  if (code === 'llm:rate-limit') return 429;
  if (code.startsWith('llm:')) return 502;
  return 500;
}

function jsonParseFailureMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const studyLlm = new Hono<{ Bindings: Env; Variables: { deviceId: string } }>();

studyLlm.post('/study-llm/stream', async (c) => {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch (err) {
    return c.json(
      {
        error: 'invalid_json',
        message: `Study LLM request body must be valid JSON: ${jsonParseFailureMessage(err)}`,
      },
      400,
    );
  }

  let request;
  try {
    request = validateStudyLlmRequest(rawBody);
  } catch (err) {
    if (err instanceof StudyLlmValidationError) {
      return c.json({ error: err.code, message: err.message }, 400);
    }
    throw err;
  }

  const policy = resolveStudyLlmPolicy(request.kind);
  const messages = buildStudyLlmMessages(request, policy);

  let upstreamChunks: AsyncIterable<{ type: 'content' | 'reasoning'; text: string }>;
  try {
    upstreamChunks = await callOpenRouterStudyStream(
      {
        modelId: policy.modelId,
        messages,
        temperature: policy.temperature,
        requestReasoning: policy.requestReasoning,
      },
      c.env,
    );
  } catch (err) {
    if (err instanceof WorkflowFail) {
      return c.json({ error: err.code, message: err.message }, workflowStatus(err.code));
    }
    throw err;
  }

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of upstreamChunks) {
          if (chunk.type === 'reasoning' && !policy.streamReasoningToClient) continue;
          controller.enqueue(encodeStudyLlmSseEvent(chunk));
        }
        controller.enqueue(encodeStudyLlmSseEvent({ type: 'done' }));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
});
