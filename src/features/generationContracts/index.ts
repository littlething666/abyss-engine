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

export {
  // Strict v1 schemas, one per ArtifactKind
  subjectGraphTopicsArtifactSchema,
  subjectGraphTopicsSchemaVersion,
  type SubjectGraphTopicsArtifactPayload,
  subjectGraphEdgesArtifactSchema,
  subjectGraphEdgesSchemaVersion,
  type SubjectGraphEdgesArtifactPayload,
  topicTheoryArtifactSchema,
  topicTheorySchemaVersion,
  type TopicTheoryArtifactPayload,
  topicStudyCardsArtifactSchema,
  topicStudyCardsSchemaVersion,
  type TopicStudyCardsArtifactPayload,
  topicMiniGameCategorySortArtifactSchema,
  topicMiniGameCategorySortSchemaVersion,
  type TopicMiniGameCategorySortArtifactPayload,
  topicMiniGameSequenceBuildArtifactSchema,
  topicMiniGameSequenceBuildSchemaVersion,
  type TopicMiniGameSequenceBuildArtifactPayload,
  topicMiniGameMatchPairsArtifactSchema,
  topicMiniGameMatchPairsSchemaVersion,
  type TopicMiniGameMatchPairsArtifactPayload,
  topicExpansionCardsArtifactSchema,
  topicExpansionCardsSchemaVersion,
  type TopicExpansionCardsArtifactPayload,
  crystalTrialArtifactSchema,
  crystalTrialSchemaVersion,
  type CrystalTrialArtifactPayload,
  // Shared Zod primitives reused across schemas
  NonEmptyString,
  KebabId,
  IsoTimestamp,
  DifficultyTier,
  StudyCardType,
  MiniGameType,
} from './schemas';

export {
  strictParse,
  strictParseArtifact,
  ARTIFACT_KIND_TO_SCHEMA,
  type StrictParseFailureCode,
  type StrictParseResult,
} from './strictParsers';

export {
  // Semantic validators (Phase 0 step 9): one per ArtifactKind, run AFTER strictParseArtifact
  SEMANTIC_VALIDATORS_BY_KIND,
  semanticValidateArtifact,
  validateSubjectGraphTopicsArtifact,
  validateSubjectGraphEdgesArtifact,
  validateTopicTheoryArtifact,
  validateTopicStudyCardsArtifact,
  validateStudyCardLikeCards,
  validateTopicMiniGameCategorySortArtifact,
  validateTopicMiniGameSequenceBuildArtifact,
  validateTopicMiniGameMatchPairsArtifact,
  validateTopicExpansionCardsArtifact,
  validateCrystalTrialArtifact,
  SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT,
  SEMANTIC_MAX_CARD_DIFFICULTY,
  SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST,
  SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE,
  type SemanticFailureCode,
  type SemanticValidator,
  type SemanticValidatorByKind,
  type SemanticValidatorContext,
  type SemanticValidatorResult,
} from './semanticValidators';

export {
  // Golden eval fixtures (Phase 0 step 10): per-kind harness inputs that lock
  // the four-outcome coverage matrix (accept / parse-fail / semantic-fail).
  EVAL_FIXTURES_BY_KIND,
  fixturesForKind,
  runFixture,
  type EvalFixture,
  type EvalFixtureRunResult,
  type EvalFixturesByKind,
  type EvalOutcome,
} from './evalFixtures';
