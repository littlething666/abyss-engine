/**
 * Server-side OpenRouter client for the durable orchestrator Worker.
 *
 * Distinct from the browser-side `HttpChatCompletionsRepository` — the Worker
 * holds the API key and never exposes it. All durable pipeline adapters route
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

type OpenRouterMessage = { role: string; content: string };
export type OpenRouterJobKind = 'crystal-trial' | 'topic-expansion' | 'subject-graph' | 'topic-content';

function openRouterHeaders(env: Env): HeadersInit {
  return {
    authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    'content-type': 'application/json',
    'http-referer': env.OPENROUTER_REFERRER ?? REFERRER,
    'x-title': X_TITLE,
  };
}

function openRouterFailureCode(status: number): string {
  if (status === 429) return 'llm:rate-limit';
  return 'llm:upstream-5xx';
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

async function openRouterFailureMessage(res: Response): Promise<string> {
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `openrouter ${res.status}: failed to read error body: ${reason}`;
  }

  const body = formatOpenRouterErrorBody(bodyText);
  return body ? `openrouter ${res.status}: ${body}` : `openrouter ${res.status}`;
}

async function throwIfOpenRouterFailed(res: Response): Promise<void> {
  if (res.ok) return;
  throw new WorkflowFail(openRouterFailureCode(res.status), await openRouterFailureMessage(res));
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
      'llm:upstream-5xx',
      `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await throwIfOpenRouterFailed(res);
  return parseOpenRouterChatResponse(res, args.jobKind);
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
