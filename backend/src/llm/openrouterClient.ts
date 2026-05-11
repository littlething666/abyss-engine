/**
 * Server-side OpenRouter client for the durable orchestrator Worker.
 *
 * The Worker holds the API key and never exposes it. All durable pipeline adapters route
 * through `callOpenRouterChat`, preserving one canonical strict `json_schema`
 * request shape while keeping per-pipeline typed seams at workflow call sites.
 *
 * Phase 4: Backend Generation Policy owns model id and provider-healing posture.
 * The OpenRouter boundary fails loudly on malformed provider wrappers; it does
 * not apply downstream parser recovery or `json_object` fallbacks.
 */

import { WorkflowFail } from '../lib/workflowErrors';
import type { JsonSchemaResponseFormat } from '../contracts/generationContracts';
import type { Env } from '../env';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REFERRER = 'https://abyss.globesoul.com';
const X_TITLE = 'Abyss Engine Durable Orchestrator';

export type OpenRouterMessage = { role: string; content: string };
export type OpenRouterJobKind = 'crystal-trial' | 'topic-expansion' | 'subject-graph' | 'topic-content';

function openRouterHeaders(env: Env): HeadersInit {
  return {
    authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    'content-type': 'application/json',
    'http-referer': env.OPENROUTER_REFERRER ?? REFERRER,
    'x-title': X_TITLE,
  };
}

function openRouterFailureCode(status: number, bodyText = ''): string {
  const normalizedBody = bodyText.toLowerCase();
  const quotaExhausted = /\b(insufficient[_ -]?quota|quota|credits?|billing|payment)\b/.test(normalizedBody);

  if (status === 429 && quotaExhausted) return 'config:quota-exhausted';
  if (status === 429) return 'llm:rate-limit';
  if (status === 408) return 'llm:timeout';
  if (status === 409 || status >= 500) return 'llm:upstream-transient';

  if (status === 401 || status === 403 || status === 404) return 'config:invalid';
  if (status === 400 || status === 413 || status === 422) return 'validation:provider-request';

  return 'validation:provider-request';
}

function formatOpenRouterErrorBody(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) return '';

  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return trimmed;
  }
}

async function openRouterFailureDetails(res: Response): Promise<{ code: string; message: string }> {
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      code: openRouterFailureCode(res.status),
      message: `openrouter ${res.status}: failed to read error body: ${reason}`,
    };
  }

  const body = formatOpenRouterErrorBody(bodyText);
  return {
    code: openRouterFailureCode(res.status, bodyText),
    message: body ? `openrouter ${res.status}: ${body}` : `openrouter ${res.status}`,
  };
}

async function throwIfOpenRouterFailed(res: Response): Promise<void> {
  if (res.ok) return;
  const failure = await openRouterFailureDetails(res);
  throw new WorkflowFail(failure.code, failure.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseOpenRouterUsage(jobKind: OpenRouterJobKind, usage: unknown): OpenRouterCallResult['usage'] {
  if (usage === undefined || usage === null) return null;
  if (!isRecord(usage)) {
    throw new WorkflowFail('parse:zod-shape', `invalid OpenRouter usage wrapper for ${jobKind}`);
  }

  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens = usage.total_tokens;

  if (!finiteNumber(promptTokens) || !finiteNumber(completionTokens) || !finiteNumber(totalTokens)) {
    throw new WorkflowFail('parse:zod-shape', `invalid OpenRouter usage wrapper for ${jobKind}`);
  }

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

async function parseOpenRouterChatResponse(
  res: Response,
  jobKind: OpenRouterJobKind,
): Promise<OpenRouterCallResult> {
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new WorkflowFail('parse:zod-shape', `invalid OpenRouter JSON response for ${jobKind}: ${message}`);
  }

  if (!isRecord(json) || !Array.isArray(json.choices)) {
    throw new WorkflowFail('parse:zod-shape', `invalid OpenRouter response wrapper for ${jobKind}`);
  }

  const firstChoice = json.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new WorkflowFail('parse:zod-shape', `missing assistant content in OpenRouter response for ${jobKind}`);
  }

  const text = firstChoice.message.content;
  if (typeof text !== 'string') {
    throw new WorkflowFail('parse:zod-shape', `missing assistant content in OpenRouter response for ${jobKind}`);
  }

  return { text, usage: parseOpenRouterUsage(jobKind, json.usage) };
}

export interface OpenRouterCallResult {
  text: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

export interface OpenRouterChatArgs {
  jobKind: OpenRouterJobKind;
  modelId: string;
  messages: OpenRouterMessage[];
  /** Contract-owned JSON Schema response format (from `jsonSchemaResponseFormat(...)`). */
  responseFormat: JsonSchemaResponseFormat;
  /** Backend Generation Policy-owned OpenRouter response-healing posture. */
  providerHealingRequested: boolean;
  temperature?: number;
}

/**
 * Canonical OpenRouter chat-completions call for durable pipeline jobs.
 *
 * All pipeline-specific adapters below route through this helper so request
 * construction cannot drift: strict `json_schema`, optional provider-healing
 * plugin, optional temperature, token-usage accounting, no streaming, and no
 * `json_object` fallback.
 */
export async function callOpenRouterChat(
  args: OpenRouterChatArgs,
  env: Env,
): Promise<OpenRouterCallResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new WorkflowFail('config:invalid', 'missing OPENROUTER_API_KEY');
  }

  const body: Record<string, unknown> = {
    model: args.modelId,
    messages: args.messages,
    response_format: args.responseFormat,
    plugins: args.providerHealingRequested
      ? [{ id: 'response-healing' }]
      : undefined,
    usage: { include: true },
  };

  if (args.temperature !== undefined) {
    body.temperature = args.temperature;
  }

  let res: Response;
  try {
    res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: openRouterHeaders(env),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new WorkflowFail(
      'llm:network',
      `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await throwIfOpenRouterFailed(res);
  return parseOpenRouterChatResponse(res, args.jobKind);
}


export type OpenRouterStudyStreamChunk =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string };

export interface OpenRouterStudyStreamArgs {
  modelId: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  requestReasoning: boolean;
}

function hasNonWhitespaceText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatOpenRouterReasoningDetails(details: unknown): string | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const parts: string[] = [];
  for (const item of details) {
    if (!item || typeof item !== 'object') {
      if (hasNonWhitespaceText(item)) parts.push(item);
      continue;
    }

    const record = item as Record<string, unknown>;
    if (record.type === 'reasoning.text' && hasNonWhitespaceText(record.text)) {
      parts.push(record.text);
    } else if (record.type === 'reasoning.summary' && hasNonWhitespaceText(record.summary)) {
      parts.push(record.summary);
    } else if (record.type === 'reasoning.encrypted') {
      parts.push('[encrypted reasoning]');
    } else {
      try {
        parts.push(JSON.stringify(record));
      } catch {
        parts.push(String(item));
      }
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : null;
}

function reasoningTextFromOpenRouterDelta(delta: Record<string, unknown>): string | null {
  if (hasNonWhitespaceText(delta.reasoning)) return delta.reasoning;
  return formatOpenRouterReasoningDetails(delta.reasoning_details);
}

function providerErrorMessage(errorValue: unknown): string {
  if (!isRecord(errorValue)) return 'OpenRouter stream error';
  const message = errorValue.message;
  if (typeof message === 'string' && message.trim()) return message;
  try {
    return JSON.stringify(errorValue);
  } catch {
    return 'OpenRouter stream error';
  }
}

export function parseOpenRouterStudyStreamSseDataLine(rawLine: string): OpenRouterStudyStreamChunk[] {
  const line = rawLine.trim();
  if (!line.startsWith('data:')) return [];
  const payload = line.slice(5).trim();
  if (payload === '' || payload === '[DONE]') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new WorkflowFail('parse:zod-shape', `invalid OpenRouter stream JSON: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new WorkflowFail('parse:zod-shape', 'invalid OpenRouter stream wrapper');
  }
  if (parsed.error !== undefined && parsed.error !== null) {
    throw new WorkflowFail('llm:upstream-transient', providerErrorMessage(parsed.error));
  }
  if (!Array.isArray(parsed.choices)) return [];

  const firstChoice = parsed.choices[0];
  if (!isRecord(firstChoice)) return [];
  if (firstChoice.error !== undefined && firstChoice.error !== null) {
    throw new WorkflowFail('llm:upstream-transient', providerErrorMessage(firstChoice.error));
  }
  if (!isRecord(firstChoice.delta)) return [];

  const out: OpenRouterStudyStreamChunk[] = [];
  const reasoningText = reasoningTextFromOpenRouterDelta(firstChoice.delta);
  if (reasoningText) out.push({ type: 'reasoning', text: reasoningText });
  if (typeof firstChoice.delta.content === 'string' && firstChoice.delta.content.length > 0) {
    out.push({ type: 'content', text: firstChoice.delta.content });
  }
  return out;
}

async function* parseOpenRouterStudyStreamBody(body: ReadableStream<Uint8Array>): AsyncGenerator<OpenRouterStudyStreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawAnyChunk = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const rawLine of lines) {
        for (const chunk of parseOpenRouterStudyStreamSseDataLine(rawLine)) {
          sawAnyChunk = true;
          yield chunk;
        }
      }
    }

    buffer += decoder.decode();
    for (const chunk of parseOpenRouterStudyStreamSseDataLine(buffer)) {
      sawAnyChunk = true;
      yield chunk;
    }
  } finally {
    reader.releaseLock();
  }

  if (!sawAnyChunk) {
    throw new WorkflowFail('parse:zod-shape', 'OpenRouter study stream ended with no assistant content');
  }
}

/**
 * Opens a backend-owned OpenRouter streaming call for study explanation routes.
 * Fetch, auth, failure classification, model id, reasoning, and request shape are
 * owned entirely by the Worker before a browser SSE response is returned.
 */
export async function callOpenRouterStudyStream(
  args: OpenRouterStudyStreamArgs,
  env: Env,
): Promise<AsyncIterable<OpenRouterStudyStreamChunk>> {
  if (!env.OPENROUTER_API_KEY) {
    throw new WorkflowFail('config:invalid', 'missing OPENROUTER_API_KEY');
  }

  const body: Record<string, unknown> = {
    model: args.modelId,
    messages: args.messages,
    stream: true,
  };
  if (args.temperature !== undefined) body.temperature = args.temperature;
  if (args.requestReasoning) body.reasoning = { enabled: true };

  let res: Response;
  try {
    res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: openRouterHeaders(env),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new WorkflowFail(
      'llm:network',
      `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await throwIfOpenRouterFailed(res);
  if (!res.body) {
    throw new WorkflowFail('parse:zod-shape', 'OpenRouter study stream missing response body');
  }

  return parseOpenRouterStudyStreamBody(res.body);
}

export interface CrystalTrialGenerateArgs {
  modelId: string;
  messages: OpenRouterMessage[];
  responseFormat: JsonSchemaResponseFormat;
  providerHealingRequested: boolean;
}

/**
 * Call OpenRouter for Crystal Trial generation with strict json_schema.
 *
 * Returns the raw assistant text and usage. The caller (workflow step) is
 * responsible for strict-parsing the text through the contracts module.
 */
export async function callCrystalTrial(
  args: CrystalTrialGenerateArgs,
  env: Env,
): Promise<OpenRouterCallResult> {
  return callOpenRouterChat({
    jobKind: 'crystal-trial',
    modelId: args.modelId,
    messages: args.messages,
    responseFormat: args.responseFormat,
    providerHealingRequested: args.providerHealingRequested,
  }, env);
}

export interface TopicExpansionGenerateArgs {
  modelId: string;
  messages: OpenRouterMessage[];
  responseFormat: JsonSchemaResponseFormat;
  providerHealingRequested: boolean;
}

/**
 * Call OpenRouter for Topic Expansion generation with strict json_schema.
 */
export async function callTopicExpansion(
  args: TopicExpansionGenerateArgs,
  env: Env,
): Promise<OpenRouterCallResult> {
  return callOpenRouterChat({
    jobKind: 'topic-expansion',
    modelId: args.modelId,
    messages: args.messages,
    responseFormat: args.responseFormat,
    providerHealingRequested: args.providerHealingRequested,
  }, env);
}

export interface SubjectGraphGenerateArgs {
  modelId: string;
  messages: OpenRouterMessage[];
  responseFormat: JsonSchemaResponseFormat;
  providerHealingRequested: boolean;
  temperature?: number;
}

/**
 * Call OpenRouter for Subject Graph generation with strict json_schema.
 */
export async function callSubjectGraph(
  args: SubjectGraphGenerateArgs,
  env: Env,
): Promise<OpenRouterCallResult> {
  return callOpenRouterChat({
    jobKind: 'subject-graph',
    modelId: args.modelId,
    messages: args.messages,
    responseFormat: args.responseFormat,
    providerHealingRequested: args.providerHealingRequested,
    temperature: args.temperature,
  }, env);
}

export interface TopicContentGenerateArgs {
  modelId: string;
  messages: OpenRouterMessage[];
  responseFormat: JsonSchemaResponseFormat;
  providerHealingRequested: boolean;
  /** The stage being generated: theory, study-cards, or mini-games:<gameType>. */
  stage: string;
}

/**
 * Call OpenRouter for Topic Content generation with strict json_schema.
 */
export async function callTopicContent(
  args: TopicContentGenerateArgs,
  env: Env,
): Promise<OpenRouterCallResult> {
  return callOpenRouterChat({
    jobKind: 'topic-content',
    modelId: args.modelId,
    messages: args.messages,
    responseFormat: args.responseFormat,
    providerHealingRequested: args.providerHealingRequested,
  }, env);
}
