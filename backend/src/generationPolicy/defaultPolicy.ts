import type { BackendGenerationJobKind, GenerationPolicy } from './types';

const DEFAULT_LLM_PIPELINE_MODEL = 'google/gemini-3.1-flash-lite-preview';

const DEFAULT_JOB_POLICY: Record<BackendGenerationJobKind, { modelId: string; temperature?: number }> = {
  'subject-graph-topics': { modelId: DEFAULT_LLM_PIPELINE_MODEL, temperature: 0.2 },
  'subject-graph-edges': { modelId: DEFAULT_LLM_PIPELINE_MODEL, temperature: 0.1 },
  'topic-theory': { modelId: DEFAULT_LLM_PIPELINE_MODEL },
  'topic-study-cards': { modelId: DEFAULT_LLM_PIPELINE_MODEL },
  'topic-card-content': { modelId: DEFAULT_LLM_PIPELINE_MODEL },
  'topic-mini-game-content': { modelId: DEFAULT_LLM_PIPELINE_MODEL },
  'topic-concept-plan': { modelId: DEFAULT_LLM_PIPELINE_MODEL, temperature: 0.1 },
  'topic-card-plan': { modelId: DEFAULT_LLM_PIPELINE_MODEL, temperature: 0.1 },
  'topic-mini-game-category-sort': { modelId: DEFAULT_LLM_PIPELINE_MODEL },
  'topic-mini-game-sequence-build': { modelId: DEFAULT_LLM_PIPELINE_MODEL },
  'topic-mini-game-match-pairs': { modelId: DEFAULT_LLM_PIPELINE_MODEL },
  'topic-expansion-cards': { modelId: DEFAULT_LLM_PIPELINE_MODEL },
  'crystal-trial': { modelId: DEFAULT_LLM_PIPELINE_MODEL },
};

/**
 * Backend-owned v1 generation policy. Browser settings never feed this object.
 * Operator overrides, if introduced later, must be backend-only and validated by
 * `parseGenerationPolicy` before any workflow sees them.
 */
export const DEFAULT_GENERATION_POLICY: GenerationPolicy = {
  version: 1,
  provider: 'openai-compatible',
  responseHealing: { enabled: true },
  jobs: DEFAULT_JOB_POLICY,
};
