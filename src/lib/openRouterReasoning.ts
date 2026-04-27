import type { OpenRouterSupportedParameter } from '@/types/llmInference';

/** OpenRouter models we treat as supporting the chat `reasoning` parameter. */
export const OPENROUTER_MODEL_IDS_WITH_REASONING = [
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'minimax/minimax-m2.5:free',
  'qwen/qwen3.5-flash-02-23',
  'mistralai/mistral-small-2603',
] as const;

const REASONING_MODEL_SET = new Set<string>(OPENROUTER_MODEL_IDS_WITH_REASONING);

const OPENROUTER_MODEL_IDS_WITH_GENERATION_TOOLS = [
  'mistralai/mistral-small-2603',
] as const;

const GENERATION_TOOL_MODEL_SET = new Set<string>(OPENROUTER_MODEL_IDS_WITH_GENERATION_TOOLS);

function hasNonWhitespaceText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function openRouterModelSupportsReasoningParameter(model: string): boolean {
  return REASONING_MODEL_SET.has(model.trim());
}

export function inferOpenRouterSupportedParameters(
  model: string,
): readonly OpenRouterSupportedParameter[] | undefined {
  const trimmed = model.trim();
  const params: OpenRouterSupportedParameter[] = [];
  if (openRouterModelSupportsReasoningParameter(trimmed)) {
    params.push('reasoning');
  }
  if (GENERATION_TOOL_MODEL_SET.has(trimmed)) {
    params.push('tools', 'response_format', 'structured_outputs');
  }
  return params.length > 0 ? params : undefined;
}

/**
 * Human-readable text from OpenRouter `reasoning_details` (non-streaming or per-delta).
 * Unknown item shapes are preserved as raw JSON text so consumers can inspect full provider output.
 */
export function formatOpenRouterReasoningDetails(details: unknown): string | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const parts: string[] = [];
  for (const item of details) {
    if (!item || typeof item !== 'object') {
      if (hasNonWhitespaceText(item)) {
        parts.push(item);
      }
      continue;
    }

    const o = item as Record<string, unknown>;
    if (o.type === 'reasoning.text' && hasNonWhitespaceText(o.text)) {
      parts.push(o.text);
    } else if (o.type === 'reasoning.summary' && hasNonWhitespaceText(o.summary)) {
      parts.push(o.summary);
    } else if (o.type === 'reasoning.encrypted') {
      parts.push('[encrypted reasoning]');
    } else {
      try {
        parts.push(JSON.stringify(o));
      } catch {
        parts.push(String(item));
      }
    }
  }
  if (parts.length === 0) return null;
  return parts.join('\n\n');
}

export function mergeAssistantReasoningDetails(msg: {
  reasoning_details?: unknown;
}): string | null {
  const fromDetails = formatOpenRouterReasoningDetails(msg.reasoning_details);
  return fromDetails;
}

export function reasoningTextFromOpenRouterDelta(delta: Record<string, unknown>): string | null {
  const fromDetails = formatOpenRouterReasoningDetails(delta.reasoning_details);
  if (fromDetails) return fromDetails;
  return null;
}
