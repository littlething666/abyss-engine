/** Stable keys for LLM inference entry points (hooks / modals). */
export type InferenceSurfaceId =
  | 'studyQuestionExplain'
  | 'studyFormulaExplain'
  | 'studyQuestionMermaid'
  | 'screenCaptureSummary'
  | 'ascentWeaver'
  | 'topicContent';

export type LlmInferenceProviderId = 'openai-compatible' | 'gemini';
