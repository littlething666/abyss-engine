import type {
  InferenceSurfaceId,
  LlmInferenceProviderId,
  OpenRouterModelConfig,
} from '../types/llmInference';
import { isStudyInferenceSurfaceId } from '../types/llmInference';
import type {
  ChatResponseFormat,
  ChatResponseFormatJsonSchema,
} from '../types/llm';
import type { StudySettingsState } from '../store/studySettingsStore';
import {
  getLocalModelId,
  getOpenRouterConfigById,
  getSurfaceBinding,
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
    if (!isStudyInferenceSurfaceId(surfaceId)) return false;
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
 * non-streaming, plus the authoritative `providerHealingRequested` metadata flag).
 *
 * Default behavior (no options or `requireJsonSchema: false`): when the bound model
 * declares `structured_outputs` and the caller supplies
 * {@link OpenRouterStructuredChatExtrasOptions.jsonSchemaResponseFormat}, uses JSON
 * Schema mode; otherwise falls back to `json_object` when `response_format` is
 * supported. This permissive shape remains for non-pipeline surfaces.
 *
 * Study explanation callers may pass `requireJsonSchema: true`. With
 * `requireJsonSchema: true` the function never returns `json_object` extras: if
 * the bound model lacks `structured_outputs` support or no JSON Schema is supplied,
 * it returns `null` so the caller fails at the boundary instead of degrading to
 * permissive output. Durable generation pipelines are backend-owned and do not use
 * browser inference-surface settings.
 *
 * The returned `providerHealingRequested` flag is the AUTHORITATIVE source of truth
 * for the "OpenRouter response-healing was requested for this call" signal. It is
 * computed deterministically as `allowProviderHealing && healingEnabledByStore` and
 * ALWAYS mirrors `plugins` presence (the `response-healing` plugin attaches iff
 * `providerHealingRequested === true`). Per Plan v3 Q22, callers MUST record it on
 * job/run metadata and telemetry; downstream parsers MUST still fail loudly when it
 * is `true`. Provider healing is provider-side structured-output support, NOT
 * permission for parser fallback.
 *
 * Returns null when the surface is not OpenRouter or the bound config does not list
 * `response_format` among supported parameters (existing no-`response_format`
 * behavior).
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

  const requireJsonSchema = options?.requireJsonSchema ?? false;
  const allowProviderHealing = options?.allowProviderHealing ?? true;
  const jsonSchemaResponseFormat = options?.jsonSchemaResponseFormat;

  const supportsStructuredOutputs = openRouterConfigSupportsParameter(config, 'structured_outputs');
  const useJsonSchema =
    jsonSchemaResponseFormat !== undefined
    && supportsStructuredOutputs;

  if (requireJsonSchema && !useJsonSchema) {
    // Caller demands strict JSON Schema mode; never fall back to `json_object`.
    return null;
  }

  const responseFormat: ChatResponseFormat = useJsonSchema
    ? jsonSchemaResponseFormat
    : { type: 'json_object' };

  const providerHealingRequested = allowProviderHealing;

  return {
    responseFormat,
    plugins: providerHealingRequested ? [{ id: 'response-healing' }] : undefined,
    forceNonStreaming: true,
    providerHealingRequested,
  };
}

export type OpenRouterStructuredChatExtrasOptions = {
  /**
   * When supplied together with a model that declares `structured_outputs`, the
   * returned extras carry strict JSON Schema response format. Required for durable
   * pipeline callers; ignored when the model only supports `response_format` unless
   * `requireJsonSchema` is also set, in which case the function returns null.
   */
  jsonSchemaResponseFormat?: ChatResponseFormatJsonSchema;
  /**
   * When true, the caller demands strict JSON Schema mode. The function will never
   * return `json_object` extras: if the bound model lacks `structured_outputs` or
   * no JSON Schema is supplied, it returns `null` so the caller fails at the
   * boundary (no permissive fallback). Defaults to `false` for study surfaces that
   * still accept plain JSON-object mode.
   */
  requireJsonSchema?: boolean;
  /**
   * When true (default), attach the OpenRouter `response-healing` plugin. When
   * false, the caller forbids provider healing entirely and `plugins` is left undefined.
   */
  allowProviderHealing?: boolean;
};

export type OpenRouterStructuredChatExtras = {
  responseFormat: ChatResponseFormat;
  plugins: Array<{ id: string }> | undefined;
  forceNonStreaming: boolean;
  /**
   * Authoritative metadata flag for the OpenRouter `response-healing` plugin
   * (Plan v3 Q22). Computed as `allowProviderHealing && healingEnabledByStore`
   * and ALWAYS mirrors `plugins` presence. Callers MUST record this on job/run
   * metadata and telemetry; downstream parsers MUST still fail loudly even when
   * this is `true`. Provider healing is provider-side structured-output support,
   * NOT permission for parser fallback.
   */
  providerHealingRequested: boolean;
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
