export { createSubjectGenerationOrchestrator } from './orchestrator/subjectGenerationOrchestrator';
export type { SubjectGenerationOrchestrator } from './orchestrator/subjectGenerationOrchestrator';
export {
  resolveSubjectGenerationStageBindings,
  type SubjectGenerationStageBinding,
  type SubjectGenerationStageBindings,
} from './orchestrator/resolveSubjectGenerationStageBindings';
export { triggerSubjectGeneration } from './triggerSubjectGeneration';
export { resolveStrategy } from './strategies/strategyResolver';
export { getVisibleTopicIds } from '@/features/progression/policies/topicUnlocking';
export type { GenerationDependencies } from './orchestrator/types';

// Phase 0.5 step 5 — Artifact Appliers
export {
  createSubjectGraphApplier,
  type SubjectGraphApplier,
  type SubjectGraphApplierDeps,
} from './appliers/subjectGraphApplier';
