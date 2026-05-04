/**
 * Snapshot builders + types. Re-exported by `../index.ts`.
 *
 * Consumers MUST import from `@/features/generationContracts`, not from this
 * file directly. The barrel exists to keep the snapshots/ directory
 * self-contained for module-internal cross-references.
 */

export type {
  CrystalTrialRunInputSnapshot,
  RunInputSnapshot,
  RunInputSnapshotEnvelope,
  SubjectGraphEdgesRunInputSnapshot,
  SubjectGraphTopicsRunInputSnapshot,
  TopicExpansionRunInputSnapshot,
  TopicMiniGameCardsRunInputSnapshot,
  TopicStudyCardsRunInputSnapshot,
  TopicTheoryRunInputSnapshot,
} from './types';

export {
  buildSubjectGraphTopicsSnapshot,
  type BuildSubjectGraphTopicsSnapshotParams,
} from './buildSubjectGraphTopicsSnapshot';
export {
  buildSubjectGraphEdgesSnapshot,
  type BuildSubjectGraphEdgesSnapshotParams,
} from './buildSubjectGraphEdgesSnapshot';
export {
  buildTopicTheorySnapshot,
  type BuildTopicTheorySnapshotParams,
} from './buildTopicTheorySnapshot';
export {
  buildTopicStudyCardsSnapshot,
  type BuildTopicStudyCardsSnapshotParams,
} from './buildTopicStudyCardsSnapshot';
export {
  buildTopicMiniGameCardsSnapshot,
  type BuildTopicMiniGameCardsSnapshotParams,
  type MiniGamePipelineKind,
} from './buildTopicMiniGameCardsSnapshot';
export {
  buildTopicExpansionSnapshot,
  type BuildTopicExpansionSnapshotParams,
} from './buildTopicExpansionSnapshot';
export {
  buildCrystalTrialSnapshot,
  type BuildCrystalTrialSnapshotParams,
} from './buildCrystalTrialSnapshot';
