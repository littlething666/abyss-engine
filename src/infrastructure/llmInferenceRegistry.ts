/**
 * LLM inference registry.
 *
 * IMPORTANT: this module has a lazy-only dependency on `studySettingsStore`
 * via `inferenceProviderForSurface` in `./llmInferenceSurfaceProviders`.
 * That creates an import cycle: registry → surfaceProviders → store.
 *
 * Do NOT add top-level imports from the store here, and do NOT read store
 * state at module load time. Keep all store reads inside function bodies so
 * the cycle is resolved at call time (not at import time).
 *
 * A future contributor who hoists a store access to module scope will break
 * app bootstrap with a cryptic `undefined` export.
 */

import type { IChatCompletionsRepository } from '../types/llm';
import type { InferenceSurfaceId, LlmInferenceProviderId } from '../types/llmInference';
import {
  createHttpChatCompletionsRepositoryFromEnv,
  HttpChatCompletionsRepository,
} from './repositories/HttpChatCompletionsRepository';
import { inferenceProviderForSurface } from './llmInferenceSurfaceProviders';
import { resolveLlmWorkerChatUrl } from './openRouterDefaults';

/**
 * Both providers now have stable config (URL + auth) because OpenRouter routes
 * through the Worker which owns the API key. Cache repos per provider.
 */
const repoByProvider = new Map<LlmInferenceProviderId, IChatCompletionsRepository>();

function createLocalRepository(): IChatCompletionsRepository {
  return createHttpChatCompletionsRepositoryFromEnv();
}

function createOpenRouterWorkerRepository(): IChatCompletionsRepository {
  const workerUrl = resolveLlmWorkerChatUrl();
  // No Authorization header: the Worker injects the OpenRouter key server-side.
  return new HttpChatCompletionsRepository(workerUrl, '', null);
}

function getRepositoryForProvider(providerId: LlmInferenceProviderId): IChatCompletionsRepository {
  const cached = repoByProvider.get(providerId);
  if (cached) return cached;
  const created = providerId === 'local' ? createLocalRepository() : createOpenRouterWorkerRepository();
  repoByProvider.set(providerId, created);
  return created;
}

export function getChatCompletionsRepositoryForSurface(
  surfaceId: InferenceSurfaceId,
): IChatCompletionsRepository {
  return getRepositoryForProvider(inferenceProviderForSurface(surfaceId));
}

/** Clears cached repository instances; for unit tests only. */
export function resetLlmInferenceRegistryForTests(): void {
  repoByProvider.clear();
}
