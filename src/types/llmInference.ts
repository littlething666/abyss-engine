/** Stable keys for LLM inference entry points (hooks / modals). */
export type InferenceSurfaceId =
  | 'studyQuestionExplain'
  | 'studyFormulaExplain'
  | 'studyQuestionMermaid'
  | 'screenCaptureSummary'
  | 'subjectGeneration'
  | 'topicContent'
  | 'crystalTrial';

export const ALL_SURFACE_IDS: readonly InferenceSurfaceId[] = [
  'studyQuestionExplain',
  'studyFormulaExplain',
  'studyQuestionMermaid',
  'screenCaptureSummary',
  'subjectGeneration',
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
  subjectGeneration: 'Subject Generation',
  topicContent: 'Topic Content',
  crystalTrial: 'Crystal Trial',
};

/**
 * One user-defined OpenRouter model configuration. A surface bound to the
 * 'openrouter' provider references one of these by `id`.
 */
export interface OpenRouterModelConfig {
  id: string;
  label: string;
  model: string;
  enableThinking: boolean;
  enableStreaming: boolean;
}

export interface SurfaceProviderBinding {
  provider: LlmInferenceProviderId;
  /** Required when provider === 'openrouter'. Null means provider is 'local'. */
  openRouterConfigId: string | null;
}
