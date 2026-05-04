/**
 * Public surface for `@/features/generationContracts`.
 *
 * This is the ONLY import surface for consumers — both the in-tree client
 * (`src/features/*`, `src/infrastructure/*`) and the future Worker target.
 * Deep imports into the directory tree from outside this module are
 * prohibited; see `AGENTS.md` next to this file.
 */

export {
  canonicalJson,
  generationHash,
  inputHash,
  contentHash,
  type GenerationHashRole,
} from './canonicalHash';

export {
  GENERATION_FAILURE_CODES,
  generationFailureCategory,
  isGenerationFailureCode,
  type GenerationFailureCategory,
  type GenerationFailureCode,
} from './failureCodes';

export {
  runEventType,
  type ArtifactReadyEventBody,
  type RunEvent,
  type RunEventBase,
  type RunStatus,
  type StageProgressEventBody,
} from './runEvents';

export type { Artifact, ArtifactEnvelope, ArtifactKind } from './artifacts/types';

export {
  buildSubjectGraphTopicsSnapshot,
  type BuildSubjectGraphTopicsSnapshotParams,
  buildSubjectGraphEdgesSnapshot,
  type BuildSubjectGraphEdgesSnapshotParams,
  buildTopicTheorySnapshot,
  type BuildTopicTheorySnapshotParams,
  buildTopicStudyCardsSnapshot,
  type BuildTopicStudyCardsSnapshotParams,
  buildTopicMiniGameCardsSnapshot,
  type BuildTopicMiniGameCardsSnapshotParams,
  type MiniGamePipelineKind,
  buildTopicExpansionSnapshot,
  type BuildTopicExpansionSnapshotParams,
  buildCrystalTrialSnapshot,
  type BuildCrystalTrialSnapshotParams,
  type CrystalTrialRunInputSnapshot,
  type RunInputSnapshot,
  type RunInputSnapshotEnvelope,
  type SubjectGraphEdgesRunInputSnapshot,
  type SubjectGraphTopicsRunInputSnapshot,
  type TopicExpansionRunInputSnapshot,
  type TopicMiniGameCardsRunInputSnapshot,
  type TopicStudyCardsRunInputSnapshot,
  type TopicTheoryRunInputSnapshot,
} from './snapshots';
