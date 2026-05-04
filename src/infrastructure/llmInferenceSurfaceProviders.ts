import type {
  InferenceSurfaceId,
  LlmInferenceProviderId,
  OpenRouterModelConfig,
} from '../types/llmInference';
import { isPipelineInferenceSurfaceId } from '../types/llmInference';
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
 * enforcement of strict JSON Schema for pipeline-bound surfaces lives in
 * {@link assertPipelineSurfaceConfigValid} (Phase 0 step 6); full removal of
 * pipeline `json_object` reliance lands in Phase 0 step 8; recording
 * `providerHealingRequested` on jobs/runs derived from `allowProviderHealing` + the
 * resolved store value lands in Phase 0 step 7.
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
    // `json_object`. Surface-level signal — `assertPipelineSurfaceConfigValid`
    // (Phase 0 step 6) additionally throws at config-validation time before
    // any LLM call is reached.
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
   * Binding-time enforcement for pipeline-bound surfaces lives in
   * {@link assertPipelineSurfaceConfigValid} (Phase 0 step 6); full removal of
   * `json_object` reliance from pipeline paths lands in Phase 0 step 8.
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

// ---------------------------------------------------------------------------
// Phase 0 step 6 — pipeline-bound surface config validation
//
// Strict JSON Schema enforcement at config-validation time (BEFORE any LLM
// call). Wired into pipeline composition roots in Phase 1+. This module only
// delivers the validator + assert primitives; existing call sites are
// untouched.
//
// Plan v3 acceptance criterion: "Pipeline-bound model config without
// `structured_outputs` fails before LLM call."
// ---------------------------------------------------------------------------

/**
 * Failure codes that pipeline-surface config validation may emit.
 *
 * These strings MUST stay in lockstep with the corresponding entries in
 * `GENERATION_FAILURE_CODES` (see
 * `src/features/generationContracts/failureCodes.ts`). They are redeclared
 * here as a local string-literal union so the infrastructure layer does not
 * import from the feature layer (root `AGENTS.md` keeps `eventBusHandlers`
 * as the only sanctioned `infrastructure → features` direction). The
 * contracts module's failure-code policy already documents that consumers
 * — Worker terminal-failure emission, telemetry dimensions, HUD copy,
 * mentor failure routing — keep these strings in sync per code.
 *
 * Phase 1's `generationRunEventHandlers.ts` composition root will route
 * validation failures into `RunEvent.run.failed` using the same code
 * identity.
 */
export type PipelineSurfaceConfigFailureCode =
  | 'config:missing-model-binding'
  | 'config:missing-structured-output'
  | 'config:invalid';

/** Result of {@link validatePipelineSurfaceConfig}. */
export type PipelineSurfaceConfigValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: PipelineSurfaceConfigFailureCode;
      readonly message: string;
    };

/**
 * Validate that a pipeline-bound inference surface is wired to a model that
 * declares strict JSON Schema support, BEFORE any LLM call is made.
 *
 * Behavior:
 * - Non-pipeline surfaces (`studyQuestionExplain`, `studyFormulaExplain`):
 *   returns `{ ok: true }` unconditionally. Those surfaces are out of scope
 *   for the strict-config gate and continue to accept the legacy permissive
 *   `json_object` shape until the durable migration completes.
 * - Pipeline surfaces (Subject Graph Generation topics + edges, Topic
 *   Content Pipeline / Topic Expansion via `topicContent`, Crystal Trial):
 *   walks the binding + bound config and returns `{ ok: false, code, message }`
 *   when any prerequisite is missing.
 *
 * Failure codes:
 * - `config:invalid` — surface is bound to the local provider, which has
 *   no strict JSON Schema capability declaration. Durable pipelines
 *   (Phase 0 + Phase 1) cannot route through the local provider in v1.
 * - `config:missing-model-binding` — surface is bound to OpenRouter but
 *   `openRouterConfigId` is missing or references an unknown config.
 * - `config:missing-structured-output` — bound config does not declare
 *   `response_format` and/or `structured_outputs` among its supported
 *   parameters; strict JSON Schema mode is impossible.
 *
 * No side effects, no LLM call, no store write. Pure read of
 * `studySettingsStore`.
 */
export function validatePipelineSurfaceConfig(
  surfaceId: InferenceSurfaceId,
): PipelineSurfaceConfigValidationResult {
  if (!isPipelineInferenceSurfaceId(surfaceId)) {
    return { ok: true };
  }
  const binding = getSurfaceBinding(surfaceId);
  if (binding.provider === 'local') {
    return {
      ok: false,
      code: 'config:invalid',
      message:
        `Pipeline-bound surface '${surfaceId}' is wired to the local provider, which has no strict JSON Schema capability declaration. `
        + `Bind it to an OpenRouter model that declares 'structured_outputs' in Global Settings.`,
    };
  }
  if (!binding.openRouterConfigId) {
    return {
      ok: false,
      code: 'config:missing-model-binding',
      message:
        `Pipeline-bound surface '${surfaceId}' is bound to OpenRouter but has no config id. `
        + `Select a model config in Global Settings.`,
    };
  }
  const config = getOpenRouterConfigById(binding.openRouterConfigId);
  if (!config) {
    return {
      ok: false,
      code: 'config:missing-model-binding',
      message:
        `Pipeline-bound surface '${surfaceId}' references missing OpenRouter config `
        + `'${binding.openRouterConfigId}'.`,
    };
  }
  if (!openRouterConfigSupportsParameter(config, 'response_format')) {
    return {
      ok: false,
      code: 'config:missing-structured-output',
      message:
        `Pipeline-bound surface '${surfaceId}' is bound to OpenRouter config '${config.id}' `
        + `(model '${config.model}'), which does not declare 'response_format' among its `
        + `supported parameters. Strict JSON Schema mode is required for durable pipelines; `
        + `choose a schema-capable model in Global Settings.`,
    };
  }
  if (!openRouterConfigSupportsParameter(config, 'structured_outputs')) {
    return {
      ok: false,
      code: 'config:missing-structured-output',
      message:
        `Pipeline-bound surface '${surfaceId}' is bound to OpenRouter config '${config.id}' `
        + `(model '${config.model}'), which does not declare 'structured_outputs' among its `
        + `supported parameters. Strict JSON Schema mode is required for durable pipelines; `
        + `choose a schema-capable model in Global Settings.`,
    };
  }
  return { ok: true };
}

/**
 * Typed Error thrown by {@link assertPipelineSurfaceConfigValid}. Carries the
 * structured failure code and the offending surface id so callers / observers
 * can route the failure into `RunEvent.run.failed` without re-parsing the
 * message.
 */
export class PipelineSurfaceConfigValidationError extends Error {
  readonly code: PipelineSurfaceConfigFailureCode;
  readonly surfaceId: InferenceSurfaceId;
  constructor(
    surfaceId: InferenceSurfaceId,
    code: PipelineSurfaceConfigFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'PipelineSurfaceConfigValidationError';
    this.code = code;
    this.surfaceId = surfaceId;
  }
}

/**
 * Hard-fail variant of {@link validatePipelineSurfaceConfig}. Throws a typed
 * {@link PipelineSurfaceConfigValidationError} when the binding fails the
 * strict-config gate. No-op for non-pipeline surfaces and for valid
 * pipeline-bound configs.
 */
export function assertPipelineSurfaceConfigValid(surfaceId: InferenceSurfaceId): void {
  const result = validatePipelineSurfaceConfig(surfaceId);
  if (result.ok) return;
  throw new PipelineSurfaceConfigValidationError(surfaceId, result.code, result.message);
}
