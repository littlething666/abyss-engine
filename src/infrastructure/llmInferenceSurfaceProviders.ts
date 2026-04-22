import type {
  InferenceSurfaceId,
  LlmInferenceProviderId,
  OpenRouterModelConfig,
} from '../types/llmInference';
import type { ChatResponseFormatJsonObject } from '../types/llm';
import type { StudySettingsState } from '../store/studySettingsStore';
import {
  getLocalModelId,
  getOpenRouterConfigById,
  getSurfaceBinding,
  studySettingsStore,
} from '../store/studySettingsStore';

export function inferenceProviderForSurface(surfaceId: InferenceSurfaceId): LlmInferenceProviderId {
  return getSurfaceBinding(surfaceId).provider;
}

function openRouterConfigForSurface(surfaceId: InferenceSurfaceId): OpenRouterModelConfig | undefined {
  const binding = getSurfaceBinding(surfaceId);
  if (binding.provider !== 'openrouter' || !binding.openRouterConfigId) return undefined;
  return getOpenRouterConfigById(binding.openRouterConfigId);
}

export function openRouterConfigSupportsReasoning(config: OpenRouterModelConfig | undefined): boolean {
  return config?.supportedParameters?.includes('reasoning') === true;
}

/** Selector factory for Zustand stores with StudySettings state. */
export function makeOpenRouterReasoningSupportedSelector(surfaceId: InferenceSurfaceId) {
  return (state: StudySettingsState) => {
    const binding = state.surfaceProviders[surfaceId];
    if (binding.provider !== 'openrouter' || !binding.openRouterConfigId) return false;
    const config = state.openRouterConfigs.find((c) => c.id === binding.openRouterConfigId);
    return openRouterConfigSupportsReasoning(config);
  };
}

/** True when this surface uses OpenRouter and the bound model supports the `reasoning` request field. */
export function resolveIncludeOpenRouterReasoningParam(surfaceId: InferenceSurfaceId): boolean {
  if (inferenceProviderForSurface(surfaceId) !== 'openrouter') return false;
  return openRouterConfigSupportsReasoning(openRouterConfigForSurface(surfaceId));
}

/** OpenRouter config flag; false when local or model does not support `reasoning`. */
export function resolveEnableReasoningForSurface(surfaceId: InferenceSurfaceId): boolean {
  if (!resolveIncludeOpenRouterReasoningParam(surfaceId)) return false;
  const config = openRouterConfigForSurface(surfaceId);
  return config?.enableReasoning === true;
}

/** Maps per-surface OpenRouter capability + user toggle into chat-completions body fields. */
export function resolveOpenRouterReasoningChatOptions(
  surfaceId: InferenceSurfaceId,
  userWantsReasoningEnabled: boolean,
): { includeOpenRouterReasoning: boolean; enableReasoning: boolean } {
  const include = resolveIncludeOpenRouterReasoningParam(surfaceId);
  return {
    includeOpenRouterReasoning: include,
    enableReasoning: include && userWantsReasoningEnabled,
  };
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

/** Resolves streaming preference for a surface via its bound OpenRouter config (true for local by default). */
export function resolveEnableStreamingForSurface(surfaceId: InferenceSurfaceId): boolean {
  const binding = getSurfaceBinding(surfaceId);
  if (binding.provider === 'local' || !binding.openRouterConfigId) return true;
  const config = getOpenRouterConfigById(binding.openRouterConfigId);
  return config?.enableStreaming ?? true;
}
