/** Stable keys for LLM inference entry points (hooks / modals). */
export type InferenceSurfaceId =
  | 'studyQuestionExplain'
  | 'studyFormulaExplain'
  | 'subjectGenerationTopics'
  | 'subjectGenerationEdges'
  | 'topicContent'
  | 'crystalTrial';

export const ALL_SURFACE_IDS: readonly InferenceSurfaceId[] = [
  'studyQuestionExplain',
  'studyFormulaExplain',
  'subjectGenerationTopics',
  'subjectGenerationEdges',
  'topicContent',
  'crystalTrial',
] as const;

/**
 * Subset of inference surfaces that drive durable, pipeline-bound generation:
 * Subject Graph topics (`subjectGenerationTopics`), Subject Graph edges
 * (`subjectGenerationEdges`), Topic Content Pipeline / Topic Expansion
 * (`topicContent`), and Crystal Trial (`crystalTrial`).
 *
 * These surfaces require strict JSON Schema-capable model bindings because
 * their parsers run in `json_schema` strict mode (Phase 0 step 3) and never
 * fall back to permissive `json_object` output (Phase 0 step 4 deprecation;
 * Phase 0 step 8 removal). Non-pipeline surfaces (e.g. `studyQuestionExplain`,
 * `studyFormulaExplain`) are NOT in this set: they continue to accept the
 * legacy permissive `json_object` shape until the durable migration completes.
 *
 * Adding a surface here requires adding the corresponding pipeline snapshot
 * builder + binding-time validation entry.
 */
export const PIPELINE_INFERENCE_SURFACE_IDS = [
  'subjectGenerationTopics',
  'subjectGenerationEdges',
  'topicContent',
  'crystalTrial',
] as const satisfies readonly InferenceSurfaceId[];

export type PipelineInferenceSurfaceId = (typeof PIPELINE_INFERENCE_SURFACE_IDS)[number];

const PIPELINE_SURFACE_ID_SET: ReadonlySet<InferenceSurfaceId> = new Set(
  PIPELINE_INFERENCE_SURFACE_IDS,
);

/** True when the surface drives a durable, pipeline-bound generation flow. */
export function isPipelineInferenceSurfaceId(
  surfaceId: InferenceSurfaceId,
): surfaceId is PipelineInferenceSurfaceId {
  return PIPELINE_SURFACE_ID_SET.has(surfaceId);
}

export type LlmInferenceProviderId = 'local' | 'openrouter';

export const ALL_PROVIDER_IDS: readonly LlmInferenceProviderId[] = [
  'local',
  'openrouter',
] as const;

export const PROVIDER_DISPLAY_LABELS: Record<LlmInferenceProviderId, string> = {
  local: 'Local (self-hosted)',
  openrouter: 'OpenRouter (via Worker)',
};

export const SURFACE_DISPLAY_LABELS: Record<InferenceSurfaceId, string> = {
  studyQuestionExplain: 'Study Question Explain',
  studyFormulaExplain: 'Study Formula Explain',
  subjectGenerationTopics: 'Curriculum — Topics',
  subjectGenerationEdges: 'Curriculum — Edges',
  topicContent: 'Topic Content',
  crystalTrial: 'Crystal Trial',
};

/** Declared OpenRouter chat parameters this app knows how to use for a config. */
export type OpenRouterSupportedParameter =
  | 'tools'
  | 'response_format'
  | 'structured_outputs';

/**
 * One user-defined OpenRouter model configuration. A surface bound to the
 * 'openrouter' provider references one of these by `id`.
 */
export interface OpenRouterModelConfig {
  id: string;
  label: string;
  model: string;
  /** User preference controlling whether to request OpenRouter `reasoning` for this config. */
  enableReasoning: boolean;
  enableStreaming: boolean;
  /** Extra OpenRouter request capabilities known to the product for this model. */
  supportedParameters?: readonly OpenRouterSupportedParameter[];
}

export interface SurfaceProviderBinding {
  provider: LlmInferenceProviderId;
  /** Required when provider === 'openrouter'. Null means provider is 'local'. */
  openRouterConfigId: string | null;
}
