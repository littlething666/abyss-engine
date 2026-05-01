import type {
  InferenceSurfaceId,
  LlmInferenceProviderId,
  OpenRouterModelConfig,
} from '../types/llmInference';
import type {
  ChatResponseFormat,
  ChatResponseFormatJsonSchema,
} from '../types/llm';
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

export function openRouterConfigSupportsParameter(
  config: OpenRouterModelConfig | undefined,
  parameter: 'tools' | 'response_format' | 'structured_outputs',
): boolean {
  return config?.supportedParameters?.includes(parameter) === true;
}

/** Selector factory for Zustand stores with StudySettings state. */
export function makeOpenRouterProviderSelector(surfaceId: InferenceSurfaceId) {
  return (state: StudySettingsState) => {
    const binding = state.surfaceProviders[surfaceId];
    if (binding.provider !== 'openrouter' || !binding.openRouterConfigId) return false;
    return state.openRouterConfigs.some((config) => config.id === binding.openRouterConfigId);
  };
}

/** True when this surface uses OpenRouter and has a bound, known OpenRouter config. */
export function resolveIncludeOpenRouterReasoningParam(surfaceId: InferenceSurfaceId): boolean {
  if (inferenceProviderForSurface(surfaceId) !== 'openrouter') return false;
  return openRouterConfigForSurface(surfaceId) !== undefined;
}

/** OpenRouter config flag; false when local or when no OpenRouter binding exists. */
export function resolveEnableReasoningForSurface(surfaceId: InferenceSurfaceId): boolean {
  const config = openRouterConfigForSurface(surfaceId);
  if (!config) return false;
  return config.enableReasoning === true;
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
 * OpenRouter-only: structured generation extras (`response_format`, optional `plugins`,
 * non-streaming). When the bound model declares `structured_outputs` and the caller
 * supplies {@link OpenRouterStructuredChatExtrasOptions.jsonSchemaResponseFormat},
 * uses JSON Schema mode; otherwise uses `json_object` when `response_format` is supported.
 *
 * Returns null when the surface is not OpenRouter or the bound config does not list
 * `response_format` among supported parameters (existing no-`response_format` behavior).
 */
export function resolveOpenRouterStructuredChatExtrasForJob(
  surfaceId: InferenceSurfaceId,
  options?: OpenRouterStructuredChatExtrasOptions,
): OpenRouterStructuredChatExtras | null {
  if (inferenceProviderForSurface(surfaceId) !== 'openrouter') {
    return null;
  }
  const config = openRouterConfigForSurface(surfaceId);
  if (!openRouterConfigSupportsParameter(config, 'response_format')) {
    return null;
  }
  const healing = studySettingsStore.getState().openRouterResponseHealing;
  const jsonSchemaResponseFormat = options?.jsonSchemaResponseFormat;
  const useJsonSchema =
    jsonSchemaResponseFormat !== undefined
    && openRouterConfigSupportsParameter(config, 'structured_outputs');

  const responseFormat: ChatResponseFormat = useJsonSchema
    ? jsonSchemaResponseFormat
    : { type: 'json_object' };

  return {
    responseFormat,
    plugins: healing ? [{ id: 'response-healing' }] : undefined,
    forceNonStreaming: true,
  };
}

export type OpenRouterStructuredChatExtrasOptions = {
  jsonSchemaResponseFormat?: ChatResponseFormatJsonSchema;
};

export type OpenRouterStructuredChatExtras = {
  responseFormat: ChatResponseFormat;
  plugins: Array<{ id: string }> | undefined;
  forceNonStreaming: boolean;
};

/**
 * @deprecated Prefer {@link resolveOpenRouterStructuredChatExtrasForJob} with explicit options.
 */
export function resolveOpenRouterStructuredJsonChatExtras(
  surfaceId: InferenceSurfaceId,
): OpenRouterStructuredChatExtras | null {
  return resolveOpenRouterStructuredChatExtrasForJob(surfaceId);
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
