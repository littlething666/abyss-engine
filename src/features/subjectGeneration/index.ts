export { triggerSubjectGeneration } from './triggerSubjectGeneration';
export { resolveStrategy } from './strategies/strategyResolver';
export { getVisibleTopicIds } from '@/features/progression/policies/topicUnlocking';

// Subject-graph artifacts are backend-staged and published as complete
// Learning Content on durable `run.completed`; no frontend graph applier is
// exported.
