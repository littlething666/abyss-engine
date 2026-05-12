/**
 * Server-side OpenAI-compatible LLM client for the durable orchestrator Worker.
 *
 * The Worker holds the API key and never exposes it. All durable pipeline adapters route
 * through `callLlmChat`, preserving one canonical strict `json_schema`
 * request shape while keeping per-pipeline typed seams at workflow call sites.
 *
 * Phase 4: Backend Generation Policy owns model id and provider-healing posture.
 * The LLM boundary fails loudly on malformed provider wrappers; it does
 * not apply downstream parser recovery or `json_object` fallbacks.
 */

import { WorkflowFail } from '../lib/workflowErrors';
import type { JsonSchemaResponseFormat } from '../contracts/generationContracts';
import type { Env } from '../env';

const DEFAULT_LLM_BASE_URL = 'https://openrouter.ai/api/v1';

export type LlmMessage = { role: string; content: string };
export type LlmJobKind = 'crystal-trial' | 'topic-expansion' | 'subject-graph' | 'topic-content';

function llmChatUrl(env: Env): string {
  const baseUrl = (env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL).replace(/\/+$/, '');
  return `${baseUrl}/chat/completions`;
}

function llmHeaders(env: Env): HeadersInit {
  const headers: Record<string, string> = {
    authorization: `Bearer ${env.LLM_API_KEY}`,
    'content-type': 'application/json',
  };

  if (env.LLM_REFERRER) headers['http-referer'] = env.LLM_REFERRER;
  if (env.LLM_TITLE) headers['x-title'] = env.LLM_TITLE;

  return headers;
}

function shouldUseProviderPlugins(env: Env): boolean {
  return env.LLM_PROVIDER === 'openrouter' || (env.LLM_BASE_URL ?? DEFAULT_LLM_BASE_URL).includes('openrouter.ai');
}

function llmFailureCode(status: number, bodyText = ''): string {
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

function formatLlmErrorBody(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) return '';

  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return trimmed;
  }
}

async function llmFailureDetails(res: Response): Promise<{ code: string; message: string }> {
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      code: llmFailureCode(res.status),
      message: `llm ${res.status}: failed to read error body: ${reason}`,
    };
  }

  const body = formatLlmErrorBody(bodyText);
  return {
    code: llmFailureCode(res.status, bodyText),
    message: body ? `llm ${res.status}: ${body}` : `llm ${res.status}`,
  };
}

async function throwIfLlmFailed(res: Response): Promise<void> {
  if (res.ok) return;
  const failure = await llmFailureDetails(res);
  throw new WorkflowFail(failure.code, failure.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function parseLlmChatResponse(
  res: Response,
  jobKind: LlmJobKind,
): Promise<LlmChatResult> {
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new WorkflowFail('parse:zod-shape', `invalid LLM JSON response for ${jobKind}: ${message}`);
  }

  if (!isRecord(json) || !Array.isArray(json.choices)) {
    throw new WorkflowFail('parse:zod-shape', `invalid LLM response wrapper for ${jobKind}`);
  }

  const firstChoice = json.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new WorkflowFail('parse:zod-shape', `missing assistant content in LLM response for ${jobKind}`);
  }

  const text = firstChoice.message.content;
  if (typeof text !== 'string') {
    throw new WorkflowFail('parse:zod-shape', `missing assistant content in LLM response for ${jobKind}`);
  }

  return { text };
}

export interface LlmChatResult {
  text: string;
}

export interface LlmChatArgs {
  jobKind: LlmJobKind;
  modelId: string;
  messages: LlmMessage[];
  /** Contract-owned JSON Schema response format (from `jsonSchemaResponseFormat(...)`). */
  responseFormat: JsonSchemaResponseFormat;
  /** Backend Generation Policy-owned provider response-healing posture. */
  providerHealingRequested: boolean;
  temperature?: number;
}

/**
 * Canonical OpenAI-compatible chat-completions call for durable pipeline jobs.
 *
 * All pipeline-specific adapters below route through this helper so request
 * construction cannot drift: strict `json_schema`, optional provider-healing
 * plugin when supported by the configured gateway, optional temperature,
 * no streaming, and no `json_object` fallback.
 */
export async function callLlmChat(
  args: LlmChatArgs,
  env: Env,
): Promise<LlmChatResult> {
  if (!env.LLM_API_KEY) {
    throw new WorkflowFail('config:invalid', 'missing LLM_API_KEY');
  }

  const body: Record<string, unknown> = {
    model: args.modelId,
    messages: args.messages,
    response_format: args.responseFormat,
  };

  if (args.providerHealingRequested && shouldUseProviderPlugins(env)) {
    body.plugins = [{ id: 'response-healing' }];
  }

  if (args.temperature !== undefined) {
    body.temperature = args.temperature;
  }

  let res: Response;
  try {
    res = await fetch(llmChatUrl(env), {
      method: 'POST',
      headers: llmHeaders(env),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new WorkflowFail(
      'llm:network',
      `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await throwIfLlmFailed(res);
  return parseLlmChatResponse(res, args.jobKind);
}


export type LlmStudyStreamChunk =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string };

export interface LlmStudyStreamArgs {
  modelId: string;
  messages: LlmMessage[];
  temperature?: number;
  requestReasoning: boolean;
}

function hasNonWhitespaceText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatProviderReasoningDetails(details: unknown): string | null {
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

function reasoningTextFromProviderDelta(delta: Record<string, unknown>): string | null {
  if (hasNonWhitespaceText(delta.reasoning)) return delta.reasoning;
  return formatProviderReasoningDetails(delta.reasoning_details);
}

function providerErrorMessage(errorValue: unknown): string {
  if (!isRecord(errorValue)) return 'LLM stream error';
  const message = errorValue.message;
  if (typeof message === 'string' && message.trim()) return message;
  try {
    return JSON.stringify(errorValue);
  } catch {
    return 'LLM stream error';
  }
}

export function parseLlmStudyStreamSseDataLine(rawLine: string): LlmStudyStreamChunk[] {
  const line = rawLine.trim();
  if (!line.startsWith('data:')) return [];
  const payload = line.slice(5).trim();
  if (payload === '' || payload === '[DONE]') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new WorkflowFail('parse:zod-shape', `invalid LLM stream JSON: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new WorkflowFail('parse:zod-shape', 'invalid LLM stream wrapper');
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

  const out: LlmStudyStreamChunk[] = [];
  const reasoningText = reasoningTextFromProviderDelta(firstChoice.delta);
  if (reasoningText) out.push({ type: 'reasoning', text: reasoningText });
  if (typeof firstChoice.delta.content === 'string' && firstChoice.delta.content.length > 0) {
    out.push({ type: 'content', text: firstChoice.delta.content });
  }
  return out;
}

async function* parseLlmStudyStreamBody(body: ReadableStream<Uint8Array>): AsyncGenerator<LlmStudyStreamChunk> {
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
        for (const chunk of parseLlmStudyStreamSseDataLine(rawLine)) {
          sawAnyChunk = true;
          yield chunk;
        }
      }
    }

    buffer += decoder.decode();
    for (const chunk of parseLlmStudyStreamSseDataLine(buffer)) {
      sawAnyChunk = true;
      yield chunk;
    }
  } finally {
    reader.releaseLock();
  }

  if (!sawAnyChunk) {
    throw new WorkflowFail('parse:zod-shape', 'LLM study stream ended with no assistant content');
  }
}

/**
 * Opens a backend-owned OpenAI-compatible streaming call for study explanation routes.
 * Fetch, auth, failure classification, model id, reasoning, and request shape are
 * owned entirely by the Worker before a browser SSE response is returned.
 */
export async function callLlmStudyStream(
  args: LlmStudyStreamArgs,
  env: Env,
): Promise<AsyncIterable<LlmStudyStreamChunk>> {
  if (!env.LLM_API_KEY) {
    throw new WorkflowFail('config:invalid', 'missing LLM_API_KEY');
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
    res = await fetch(llmChatUrl(env), {
      method: 'POST',
      headers: llmHeaders(env),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new WorkflowFail(
      'llm:network',
      `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await throwIfLlmFailed(res);
  if (!res.body) {
    throw new WorkflowFail('parse:zod-shape', 'LLM study stream missing response body');
  }

  return parseLlmStudyStreamBody(res.body);
}

export interface CrystalTrialGenerateArgs {
  modelId: string;
  messages: LlmMessage[];
  responseFormat: JsonSchemaResponseFormat;
  providerHealingRequested: boolean;
}

/**
 * Call the configured LLM gateway for Crystal Trial generation with strict json_schema.
 *
 * Returns the raw assistant text. The caller (workflow step) is
 * responsible for strict-parsing the text through the contracts module.
 */
export async function callCrystalTrial(
  args: CrystalTrialGenerateArgs,
  env: Env,
): Promise<LlmChatResult> {
  return callLlmChat({
    jobKind: 'crystal-trial',
    modelId: args.modelId,
    messages: args.messages,
    responseFormat: args.responseFormat,
    providerHealingRequested: args.providerHealingRequested,
  }, env);
}

export interface TopicExpansionGenerateArgs {
  modelId: string;
  messages: LlmMessage[];
  responseFormat: JsonSchemaResponseFormat;
  providerHealingRequested: boolean;
}

/**
 * Call the configured LLM gateway for Topic Expansion generation with strict json_schema.
 */
export async function callTopicExpansion(
  args: TopicExpansionGenerateArgs,
  env: Env,
): Promise<LlmChatResult> {
  return callLlmChat({
    jobKind: 'topic-expansion',
    modelId: args.modelId,
    messages: args.messages,
    responseFormat: args.responseFormat,
    providerHealingRequested: args.providerHealingRequested,
  }, env);
}

export interface SubjectGraphGenerateArgs {
  modelId: string;
  messages: LlmMessage[];
  responseFormat: JsonSchemaResponseFormat;
  providerHealingRequested: boolean;
  temperature?: number;
}

/**
 * Call the configured LLM gateway for Subject Graph generation with strict json_schema.
 */
export async function callSubjectGraph(
  args: SubjectGraphGenerateArgs,
  env: Env,
): Promise<LlmChatResult> {
  return callLlmChat({
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
  messages: LlmMessage[];
  responseFormat: JsonSchemaResponseFormat;
  providerHealingRequested: boolean;
  temperature?: number;
  /** The stage being generated: theory, study-cards, mini-games:<gameType>, or planning:<name>. */
  stage: string;
}

/**
 * Call the configured LLM gateway for Topic Content generation with strict json_schema.
 */
export async function callTopicContent(
  args: TopicContentGenerateArgs,
  env: Env,
): Promise<LlmChatResult> {
  return callLlmChat({
    jobKind: 'topic-content',
    modelId: args.modelId,
    messages: args.messages,
    responseFormat: args.responseFormat,
    providerHealingRequested: args.providerHealingRequested,
    temperature: args.temperature,
  }, env);
}
