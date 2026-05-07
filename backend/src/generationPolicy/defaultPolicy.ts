import type { BackendGenerationJobKind, GenerationPolicy } from './types';

const DEFAULT_OPENROUTER_PIPELINE_MODEL = 'openrouter/google/gemini-2.5-flash';

const DEFAULT_JOB_POLICY: Record<BackendGenerationJobKind, { modelId: string; temperature?: number }> = {
  'subject-graph-topics': { modelId: DEFAULT_OPENROUTER_PIPELINE_MODEL, temperature: 0.2 },
  'subject-graph-edges': { modelId: DEFAULT_OPENROUTER_PIPELINE_MODEL, temperature: 0.1 },
  'topic-theory': { modelId: DEFAULT_OPENROUTER_PIPELINE_MODEL },
  'topic-study-cards': { modelId: DEFAULT_OPENROUTER_PIPELINE_MODEL },
  'topic-mini-game-category-sort': { modelId: DEFAULT_OPENROUTER_PIPELINE_MODEL },
  'topic-mini-game-sequence-build': { modelId: DEFAULT_OPENROUTER_PIPELINE_MODEL },
  'topic-mini-game-match-pairs': { modelId: DEFAULT_OPENROUTER_PIPELINE_MODEL },
  'topic-expansion-cards': { modelId: DEFAULT_OPENROUTER_PIPELINE_MODEL },
  'crystal-trial': { modelId: DEFAULT_OPENROUTER_PIPELINE_MODEL },
};

/**
 * Backend-owned v1 generation policy. Browser settings never feed this object.
 * Operator overrides, if introduced later, must be backend-only and validated by
 * `parseGenerationPolicy` before any workflow sees them.
 */
export const DEFAULT_GENERATION_POLICY: GenerationPolicy = {
  version: 1,
  provider: 'openrouter',
  responseHealing: { enabled: true },
  jobs: DEFAULT_JOB_POLICY,
};
