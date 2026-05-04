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
 * non-streaming).
 *
 * Default behavior (no options or `requireJsonSchema: false`): when the bound model
 * declares `structured_outputs` and the caller supplies
 * {@link OpenRouterStructuredChatExtrasOptions.jsonSchemaResponseFormat}, uses JSON
 * Schema mode; otherwise falls back to `json_object` when `response_format` is
 * supported. This permissive shape remains for non-pipeline surfaces.
 *
 * Durable pipeline callers (Subject Graph Generation, Topic Content Pipeline, Topic
 * Expansion, Crystal Trial) must pass `requireJsonSchema: true` and
 * `allowProviderHealing: true`. With `requireJsonSchema: true` the function never
 * returns `json_object` extras: if the bound model lacks `structured_outputs` support
 * or no JSON Schema is supplied, it returns `null` so the caller fails at the
 * boundary instead of degrading to permissive output. Binding-time / config-validation
 * enforcement of strict JSON Schema for pipeline-bound surfaces lands in Phase 0
 * step 6; full removal of pipeline `json_object` reliance lands in Phase 0 step 8;
 * recording `providerHealingRequested` on jobs/runs derived from
 * `allowProviderHealing` + the resolved store value lands in Phase 0 step 7.
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
    // Pipeline caller demands strict JSON Schema mode; never fall back to
    // `json_object`. Surface-level signal only — Phase 0 step 6 will additionally
    // throw at config-validation time before any LLM call is reached.
    return null;
  }

  const responseFormat: ChatResponseFormat = useJsonSchema
    ? jsonSchemaResponseFormat
    : { type: 'json_object' };

  const healingEnabledByStore = studySettingsStore.getState().openRouterResponseHealing;
  const includeHealingPlugin = allowProviderHealing && healingEnabledByStore;

  return {
    responseFormat,
    plugins: includeHealingPlugin ? [{ id: 'response-healing' }] : undefined,
    forceNonStreaming: true,
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
   * When true, the caller is a durable pipeline and demands strict JSON Schema mode.
   * The function will never return `json_object` extras: if the bound model lacks
   * `structured_outputs` or no JSON Schema is supplied, it returns `null` so the
   * caller fails at the boundary (no permissive fallback). Defaults to `false`,
   * preserving the legacy permissive shape used by non-pipeline surfaces.
   *
   * Aligns with Plan v3 Q5 (parse fail-loud) and the strict-structured-output gate.
   * Binding-time enforcement for pipeline-bound surfaces lands in Phase 0 step 6;
   * full removal of `json_object` reliance from pipeline paths lands in Phase 0
   * step 8.
   */
  requireJsonSchema?: boolean;
  /**
   * When true (default), respect the workspace `openRouterResponseHealing` setting
   * and attach the OpenRouter `response-healing` plugin when enabled. When false,
   * the caller forbids provider healing entirely and `plugins` is left undefined.
   *
   * Plan v3 Q22 keeps `response-healing` enabled for v1 pipelines together with
   * strict JSON Schema mode — durable callers should pass `true` and Phase 0 step 7
   * will record `providerHealingRequested` on jobs/runs derived from this flag
   * combined with the resolved store value.
   */
  allowProviderHealing?: boolean;
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
