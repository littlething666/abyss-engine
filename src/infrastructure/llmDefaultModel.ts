/**
 * When NEXT_PUBLIC_LLM_MODEL is unset, OpenAI-compatible clients still need a non-empty model id.
 * Override via env in production; local proxies often accept any placeholder.
 */
export const FALLBACK_LLM_MODEL = '';

export function resolveDefaultLlmModel(): string {
  return process.env.NEXT_PUBLIC_LLM_MODEL?.trim() || FALLBACK_LLM_MODEL;
}
