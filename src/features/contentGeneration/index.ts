export { useContentGenerationStore, MAX_PERSISTED_LOGS } from './contentGenerationStore';
export type { ContentGenerationState } from './contentGenerationStore';

export { runContentGenerationJob } from './runContentGenerationJob';
export type { ContentGenerationJobParams } from './runContentGenerationJob';

export { runTopicUnlockPipeline } from './pipelines/runTopicUnlockPipeline';
export type { RunTopicUnlockPipelineParams } from './pipelines/runTopicUnlockPipeline';
export { triggerTopicUnlockPipeline } from './pipelines/triggerTopicUnlockPipeline';

export { runExpansionJob } from './jobs/runExpansionJob';
export type { RunExpansionJobParams } from './jobs/runExpansionJob';

export { topicStudyContentReady } from './topicStudyContentReady';

/**
 * @deprecated Use `SubjectTopicRef` from `@/lib/topicRef` instead of resolving
 * subjectId at runtime. See deprecation notice on the function for details.
 */
export { findSubjectIdForTopic } from './findSubjectIdForTopic';

export { buildTopicTheoryMessages } from './messages/buildTopicTheoryMessages';
export type { TopicTheoryPromptParams } from './messages/buildTopicTheoryMessages';
export { buildTopicStudyCardsMessages } from './messages/buildTopicStudyCardsMessages';
export type { TopicStudyCardsPromptParams } from './messages/buildTopicStudyCardsMessages';
export { buildTopicMiniGameCardsMessages } from './messages/buildTopicMiniGameCardsMessages';
export type { TopicMiniGameCardsPromptParams } from './messages/buildTopicMiniGameCardsMessages';
export { buildTopicExpansionCardsMessages } from './messages/buildTopicExpansionCardsMessages';
export type { TopicExpansionCardsPromptParams } from './messages/buildTopicExpansionCardsMessages';

export { parseTopicTheoryPayload } from './parsers/parseTopicTheoryPayload';
export type { ParsedTopicTheoryPayload, ParseTopicTheoryResult } from './parsers/parseTopicTheoryPayload';
export { parseTopicCardsPayload, diagnoseTopicCardsPayload } from './parsers/parseTopicCardsPayload';
export type { ParseTopicCardsResult } from './parsers/parseTopicCardsPayload';
export { validateGeneratedCard } from './parsers/validateGeneratedCard';
