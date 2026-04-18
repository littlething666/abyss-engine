import type { InferenceSurfaceId, LlmInferenceProviderId } from '../types/llmInference';
import type { ChatResponseFormatJsonObject } from '../types/llm';
import {
  getLocalModelId,
  getOpenRouterConfigById,
  getSurfaceBinding,
  studySettingsStore,
} from '../store/studySettingsStore';

export function inferenceProviderForSurface(surfaceId: InferenceSurfaceId): LlmInferenceProviderId {
  return getSurfaceBinding(surfaceId).provider;
}

/**
 * OpenRouter-only: `response_format: json_object` for structured generation jobs.
 * When response healing is enabled in settings, includes the OpenRouter `response-healing` plugin
 * (non-streaming; callers should set `enableStreaming: false` when this is non-null).
 */
export function resolveOpenRouterStructuredJsonChatExtras(
  surfaceId: InferenceSurfaceId,
): {
  responseFormat: ChatResponseFormatJsonObject;
  plugins: Array<{ id: string }> | undefined;
  forceNonStreaming: boolean;
} | null {
  if (inferenceProviderForSurface(surfaceId) !== 'openrouter') {
    return null;
  }
  const healing = studySettingsStore.getState().openRouterResponseHealing;
  return {
    responseFormat: { type: 'json_object' },
    plugins: healing ? [{ id: 'response-healing' }] : undefined,
    forceNonStreaming: true,
  };
}

function localEnvModel(): string {
  return process.env.NEXT_PUBLIC_LLM_MODEL?.trim() ?? '';
}

/** Model id string appropriate for the configured provider of this surface. */
export function resolveModelForSurface(surfaceId: InferenceSurfaceId): string {
  const binding = getSurfaceBinding(surfaceId);
  if (binding.provider === 'local') {
    return getLocalModelId().trim() || localEnvModel();
  }
  // openrouter
  if (!binding.openRouterConfigId) {
    throw new Error(
      `Surface '${surfaceId}' is bound to OpenRouter but has no config id. Select a model config in Global Settings.`,
    );
  }
  const config = getOpenRouterConfigById(binding.openRouterConfigId);
  if (!config) {
    throw new Error(
      `Surface '${surfaceId}' references missing OpenRouter config '${binding.openRouterConfigId}'.`,
    );
  }
  return config.model;
}

/** Resolves enableThinking for a surface via its bound OpenRouter config (false for local). */
export function resolveEnableThinkingForSurface(surfaceId: InferenceSurfaceId): boolean {
  const binding = getSurfaceBinding(surfaceId);
  if (binding.provider === 'local' || !binding.openRouterConfigId) return false;
  const config = getOpenRouterConfigById(binding.openRouterConfigId);
  return config?.enableThinking ?? false;
}

/** Resolves streaming preference for a surface via its bound OpenRouter config (true for local by default). */
export function resolveEnableStreamingForSurface(surfaceId: InferenceSurfaceId): boolean {
  const binding = getSurfaceBinding(surfaceId);
  if (binding.provider === 'local' || !binding.openRouterConfigId) return true;
  const config = getOpenRouterConfigById(binding.openRouterConfigId);
  return config?.enableStreaming ?? true;
}
