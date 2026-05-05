/**
 * Server-side OpenRouter client for the durable orchestrator Worker.
 *
 * Distinct from the browser-side `HttpChatCompletionsRepository` — both share
 * the canonical request-shape builders (from @contracts once prompts land in
 * Phase 0 step 12), but the Worker holds the API key and never exposes it.
 *
 * Phase 1 PR-D: Crystal Trial generation only.  Strict json_schema mode is
 * mandatory; response-healing is requested per Plan v3 Q22.
 */

import { WorkflowFail } from '../lib/workflowErrors';
import type { Env } from '../env';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REFERRER = 'https://abyss.globesoul.com';
const X_TITLE = 'Abyss Engine — Durable Orchestrator';

export interface OpenRouterCallResult {
  text: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

export interface CrystalTrialGenerateArgs {
  modelId: string;
  messages: Array<{ role: string; content: string }>;
  jsonSchema: Record<string, unknown>;
  providerHealingRequested: boolean;
}

/**
 * Call OpenRouter for Crystal Trial generation with strict json_schema.
 *
 * Returns the raw assistant text and usage.  The caller (workflow step) is
 * responsible for strict-parsing the text through the contracts module.
 */
export async function callCrystalTrial(
  args: CrystalTrialGenerateArgs,
  env: Env,
): Promise<OpenRouterCallResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new WorkflowFail('config:invalid', 'missing OPENROUTER_API_KEY');
  }

  const body: Record<string, unknown> = {
    model: args.modelId,
    messages: args.messages,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'crystal_trial',
        strict: true,
        schema: args.jsonSchema,
      },
    },
    plugins: args.providerHealingRequested
      ? [{ id: 'response-healing' }]
      : undefined,
    usage: { include: true },
  };

  let res: Response;
  try {
    res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'content-type': 'application/json',
        'http-referer': env.OPENROUTER_REFERRER ?? REFERRER,
        'x-title': X_TITLE,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new WorkflowFail(
      'llm:upstream-5xx',
      `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (res.status === 429) {
    throw new WorkflowFail('llm:rate-limit', 'openrouter 429');
  }
  if (res.status >= 500) {
    throw new WorkflowFail('llm:upstream-5xx', `openrouter ${res.status}`);
  }
  if (!res.ok) {
    throw new WorkflowFail('llm:upstream-5xx', `openrouter ${res.status}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  const text = json.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new WorkflowFail('parse:zod-shape', 'missing assistant content in OpenRouter response');
  }

  return { text, usage: json.usage ?? null };
}
