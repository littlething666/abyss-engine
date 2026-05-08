/**
 * Worker contract adapter — single import surface for backend workflows.
 *
 * This module re-exports from `@contracts` (TS paths →
 * `../src/features/generationContracts`; Wrangler `[alias]` →
 * `.../generationContracts/index.ts` because esbuild does not resolve a
 * directory alias to `index.ts`) the
 * narrow set of public APIs that the backend orchestrator needs.
 *
 * ## Boundary rules
 *
 * - Backend workflows, routes, and repositories that consume durable
 *   generation contracts must import from THIS file, not from
 *   `@contracts/*` directly. Exceptions require adding a re-export here
 *   and updating the boundary test.
 * - NO backend workflow may define local `computeInputHash`, random
 *   `contentHash`, inline JSON Schema payloads, inline parser fallback,
 *   or partial `artifact.ready` payload builders. All those come from
 *   the contracts module through this adapter.
 * - Adding a re-export here that is not already on the contracts module's
 *   public barrel (`index.ts`) is prohibited — the contracts module owns
 *   its public API.
 */

// ── canonical hashes ───────────────────────────────────────────────────────
export {
  canonicalJson,
  inputHash,
  contentHash,
  generationHash,
  type GenerationHashRole,
} from '@contracts';

// ── failure codes ──────────────────────────────────────────────────────────
export {
  GENERATION_FAILURE_CODES,
  generationFailureCategory,
  isGenerationFailureCode,
  type GenerationFailureCode,
  type GenerationFailureCategory,
} from '@contracts';

// ── run events + run status ────────────────────────────────────────────────
export {
  runEventType,
  type ArtifactReadyEventBody,
  type RunEvent,
  type RunEventBase,
  type RunStatus,
  type StageProgressEventBody,
} from '@contracts';

// ── artifact types ─────────────────────────────────────────────────────────
export type {
  Artifact,
  ArtifactEnvelope,
  ArtifactKind,
} from '@contracts';

// ── strict parsers ─────────────────────────────────────────────────────────
export {
  strictParse,
  strictParseArtifact,
  ARTIFACT_KIND_TO_SCHEMA,
  type StrictParseFailureCode,
  type StrictParseResult,
} from '@contracts';

// ── semantic validators ────────────────────────────────────────────────────
export {
  SEMANTIC_VALIDATORS_BY_KIND,
  semanticValidateArtifact,
  SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT,
  SEMANTIC_MAX_CARD_DIFFICULTY,
  SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST,
  SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE,
  type SemanticFailureCode,
  type SemanticValidator,
  type SemanticValidatorByKind,
  type SemanticValidatorContext,
  type SemanticValidatorResult,
} from '@contracts';

// ── schemas + versions ─────────────────────────────────────────────────────
export {
  subjectGraphTopicsSchemaVersion,
  subjectGraphEdgesSchemaVersion,
  topicTheorySchemaVersion,
  topicStudyCardsSchemaVersion,
  topicMiniGameCategorySortSchemaVersion,
  topicMiniGameSequenceBuildSchemaVersion,
  topicMiniGameMatchPairsSchemaVersion,
  topicExpansionCardsSchemaVersion,
  crystalTrialSchemaVersion,
} from '@contracts';

export type {
  SubjectGraphTopicsArtifactPayload,
  SubjectGraphEdgesArtifactPayload,
  TopicTheoryArtifactPayload,
  TopicStudyCardsArtifactPayload,
  TopicMiniGameCategorySortArtifactPayload,
  TopicMiniGameSequenceBuildArtifactPayload,
  TopicMiniGameMatchPairsArtifactPayload,
  TopicExpansionCardsArtifactPayload,
  CrystalTrialArtifactPayload,
} from '@contracts';

// ── JSON Schema response-format builders ───────────────────────────────────
// Backend workflows must use jsonSchemaResponseFormat(kind) instead of
// hand-writing inline JSON Schema payloads.
export {
  jsonSchemaResponseFormat,
  JSON_SCHEMA_RESPONSE_FORMAT_BY_KIND,
  JSON_SCHEMA_RESPONSE_FORMAT_NAMES,
  type JsonSchemaResponseFormat,
} from '@contracts';

// ── snapshots ──────────────────────────────────────────────────────────────
export {
  buildSubjectGraphTopicsSnapshot,
  buildSubjectGraphEdgesSnapshot,
  buildTopicTheorySnapshot,
  buildTopicStudyCardsSnapshot,
  buildTopicMiniGameCardsSnapshot,
  buildTopicExpansionSnapshot,
  buildCrystalTrialSnapshot,
  type BuildSubjectGraphTopicsSnapshotParams,
  type BuildSubjectGraphEdgesSnapshotParams,
  type BuildTopicTheorySnapshotParams,
  type BuildTopicStudyCardsSnapshotParams,
  type BuildTopicMiniGameCardsSnapshotParams,
  type BuildTopicExpansionSnapshotParams,
  type BuildCrystalTrialSnapshotParams,
  type MiniGamePipelineKind,
  type RunInputSnapshot,
  type RunInputSnapshotEnvelope,
} from '@contracts';

// ── typed event builders (Phase 3.6 Step 6) ────────────────────────────────
export {
  buildTypedEvent,
  buildRunQueuedEvent,
  buildRunStatusEvent,
  buildStageProgressEvent,
  buildArtifactReadyEvent,
  buildRunCompletedEvent,
  buildRunFailedEvent,
  buildRunCancelledEvent,
  buildRunCancelAcknowledgedEvent,
  type TypedEventType,
  type TypedEventPayload,
  type TypedEventPayloadMap,
  type RunQueuedPayload,
  type RunStatusPayload,
  type StageProgressPayload,
  type ArtifactReadyPayload,
  type RunCompletedPayload,
  type RunFailedPayload,
  type RunCancelledPayload,
  type RunCancelAcknowledgedPayload,
} from './typedEvents';

// ── eval fixtures (for backend-side eval runner) ───────────────────────────
export {
  EVAL_FIXTURES_BY_KIND,
  fixturesForKind,
  runFixture,
  type EvalFixture,
  type EvalFixtureRunResult,
  type EvalFixturesByKind,
  type EvalOutcome,
} from '@contracts';
