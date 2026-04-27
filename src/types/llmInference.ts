/** Stable keys for LLM inference entry points (hooks / modals). */
export type InferenceSurfaceId =
  | 'studyQuestionExplain'
  | 'studyFormulaExplain'
  | 'studyQuestionMermaid'
  | 'screenCaptureSummary'
  | 'subjectGenerationTopics'
  | 'subjectGenerationEdges'
  | 'topicContent'
  | 'crystalTrial';

export const ALL_SURFACE_IDS: readonly InferenceSurfaceId[] = [
  'studyQuestionExplain',
  'studyFormulaExplain',
  'studyQuestionMermaid',
  'screenCaptureSummary',
  'subjectGenerationTopics',
  'subjectGenerationEdges',
  'topicContent',
  'crystalTrial',
] as const;

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
  studyQuestionMermaid: 'Study Mermaid Diagrams',
  screenCaptureSummary: 'Screen Capture Summary',
  subjectGenerationTopics: 'Curriculum — Topics',
  subjectGenerationEdges: 'Curriculum — Edges',
  topicContent: 'Topic Content',
  crystalTrial: 'Crystal Trial',
};

/** Declared OpenRouter chat parameters this app knows how to use for a config. */
export type OpenRouterSupportedParameter =
  | 'reasoning'
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
  /** When the model supports OpenRouter `reasoning`, persisted user preference. */
  enableReasoning: boolean;
  enableStreaming: boolean;
  /** If omitted or empty, inferred from `model` when loading or after model edits. */
  supportedParameters?: readonly OpenRouterSupportedParameter[];
}

export interface SurfaceProviderBinding {
  provider: LlmInferenceProviderId;
  /** Required when provider === 'openrouter'. Null means provider is 'local'. */
  openRouterConfigId: string | null;
}
