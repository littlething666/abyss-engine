import type { IChatCompletionsRepository } from '../types/llm';
import type { InferenceSurfaceId, LlmInferenceProviderId } from '../types/llmInference';
import { createGeminiGenerativeLanguageRepositoryFromEnv } from './repositories/GeminiGenerativeLanguageRepository';
import { createHttpChatCompletionsRepositoryFromEnv } from './repositories/HttpChatCompletionsRepository';
import { inferenceProviderForSurface } from './llmInferenceSurfaceProviders';

const repoByProvider = new Map<LlmInferenceProviderId, IChatCompletionsRepository>();

function getRepositoryForProvider(providerId: LlmInferenceProviderId): IChatCompletionsRepository {
  const cached = repoByProvider.get(providerId);
  if (cached) {
    return cached;
  }
  const created =
    providerId === 'gemini'
      ? createGeminiGenerativeLanguageRepositoryFromEnv()
      : createHttpChatCompletionsRepositoryFromEnv();
  repoByProvider.set(providerId, created);
  return created;
}

export function getChatCompletionsRepositoryForSurface(
  surfaceId: InferenceSurfaceId,
): IChatCompletionsRepository {
  const provider = inferenceProviderForSurface(surfaceId);
  return getRepositoryForProvider(provider);
}

/** Clears cached repository instances; for unit tests only. */
export function resetLlmInferenceRegistryForTests(): void {
  repoByProvider.clear();
}
