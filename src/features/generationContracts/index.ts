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
} from './snapshots/types';
