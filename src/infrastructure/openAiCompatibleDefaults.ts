/**
 * Default OpenAI-compatible chat URL when no per-request override is provided.
 * Matches {@link createHttpChatCompletionsRepositoryFromEnv}.
 */
export function resolveDefaultOpenAiChatCompletionsUrl(): string {
  return process.env.NEXT_PUBLIC_LLM_CHAT_URL ?? 'http://localhost:8080/v1/chat/completions';
}
