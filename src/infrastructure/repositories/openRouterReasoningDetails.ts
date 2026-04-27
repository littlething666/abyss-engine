function hasNonWhitespaceText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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
  return formatOpenRouterReasoningDetails(msg.reasoning_details);
}

export function reasoningTextFromOpenRouterDelta(delta: Record<string, unknown>): string | null {
  return formatOpenRouterReasoningDetails(delta.reasoning_details);
}
