export const BACKEND_GENERATION_JOB_KINDS = [
  'subject-graph-topics',
  'subject-graph-edges',
  'topic-theory',
  'topic-study-cards',
  'topic-mini-game-category-sort',
  'topic-mini-game-sequence-build',
  'topic-mini-game-match-pairs',
  'topic-expansion-cards',
  'crystal-trial',
] as const;

export type BackendGenerationJobKind = (typeof BACKEND_GENERATION_JOB_KINDS)[number];

export type GenerationPolicyVersion = 1;
export type GenerationProvider = 'openrouter';

export interface GenerationJobPolicy {
  modelId: string;
  temperature?: number;
}

export interface GenerationPolicy {
  version: GenerationPolicyVersion;
  provider: GenerationProvider;
  responseHealing: { enabled: true };
  jobs: Record<BackendGenerationJobKind, GenerationJobPolicy>;
}

export interface ResolvedGenerationJobPolicy {
  jobKind: BackendGenerationJobKind;
  provider: GenerationProvider;
  modelId: string;
  temperature?: number;
  providerHealingRequested: true;
  generationPolicyHash: string;
  policyVersion: GenerationPolicyVersion;
}
