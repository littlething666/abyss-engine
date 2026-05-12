import type { Card, MiniGameType, Subject, SubjectGraph, TopicDetails } from './core';
import type { CrystalTrialScenarioQuestion } from './crystalTrial';
import type { StudyChecklist } from './studyChecklist';
import type { TopicContentStatusRecord } from './topicContent';
import type {
  ArtifactEnvelope,
  RunEvent,
  RunInputSnapshot,
  RunStatus,
} from '@abyss/generation-contracts';

export interface Manifest {
  subjects: Subject[];
}

export type DeckContentSource = 'bundled' | 'generated' | 'manual';

export interface ManifestOptions {
  includePregeneratedCurriculums?: boolean;
}

export interface IDeckRepository {
  getManifest(options?: ManifestOptions): Promise<Manifest>;
  getSubjectGraph(subjectId: string): Promise<SubjectGraph>;
  getTopicDetails(subjectId: string, topicId: string): Promise<TopicDetails>;
  getTopicCards(subjectId: string, topicId: string): Promise<Card[]>;
  getTopicContentStatuses(subjectId: string): Promise<TopicContentStatusRecord[]>;
}

export interface CrystalTrialSetReadModel {
  subjectId: string;
  topicId: string;
  targetLevel: number;
  cardPoolHash: string;
  questions: CrystalTrialScenarioQuestion[];
  contentHash: string;
  createdByRunId: string;
  createdAt: string;
}

export interface ICrystalTrialSetRepository {
  getCurrentTrialSet(subjectId: string, topicId: string, targetLevel: number): Promise<CrystalTrialSetReadModel | null>;
}

export interface IDeckContentWriter {
  upsertSubject(subject: Subject & { themeId?: string; contentSource?: DeckContentSource }): Promise<void>;
  upsertGraph(graph: SubjectGraph): Promise<void>;
  upsertTopicDetails(details: TopicDetails): Promise<void>;
  upsertTopicCards(subjectId: string, topicId: string, cards: Card[]): Promise<void>;
  /** Merges with existing deck: same `card.id` replaces; new ids append. */
  appendTopicCards(subjectId: string, topicId: string, cards: Card[]): Promise<void>;
}

export interface StudyHistoryQuery {
  daysWindow?: number;
  fromTimestamp?: number;
  toTimestamp?: number;
  eventTypes?: string[];
  topicId?: string | null;
  sessionId?: string | null;
  topicIds?: string[];
}

export interface StudyHistoryRepositoryRecord {
  id: string;
  version: 'v1';
  timestamp: number;
  sessionId: string | null;
  topicId: string | null;
  type: string;
  payload: Record<string, unknown>;
}

export interface IStudyHistoryRepository {
  getAll(): StudyHistoryRepositoryRecord[];
  getByQuery(options?: StudyHistoryQuery): StudyHistoryRepositoryRecord[];
  log(record: StudyHistoryRepositoryRecord): void;
  prune(days: number): void;
  clear(): void;
  exportLog(): string;
}

// ---------------------------------------------------------------------------
// Durable Workflow Orchestration
//
// `IGenerationRunRepository` is the durable Worker adapter contract consumed
// only through the `GenerationClient` facade. Browser submissions are compact
// generation intents; backend snapshots remain read-only observation data.
// ---------------------------------------------------------------------------

/**
 * Pipeline-kind discriminator for `IGenerationRunRepository.submitRun` and
 * `RunSnapshot`. Mirrors the durable orchestrator's Workflow class set.
 *
 * - `topic-content`: Topic Content Pipeline (theory + study cards + mini-games).
 *   Three checkpointed stages share one `runId`; the snapshot bound to the
 *   current job is the variant for that stage (see
 *   `TopicContentRunInputSnapshot`).
 * - `topic-expansion`: Topic Expansion at a Crystal Level boundary.
 * - `subject-graph`: Subject Graph Generation. Two stages share one `runId`:
 *   Stage A (`topics`, the lattice) then Stage B (`edges`, the prereq graph).
 * - `crystal-trial`: Crystal Trial question generation. Generation success
 *   prepares questions only — it MUST NOT emit `crystal-trial:completed`,
 *   which remains the player-assessment surface (Plan v3 Q21).
 */
export type PipelineKind =
  | 'topic-content'
  | 'topic-expansion'
  | 'subject-graph'
  | 'crystal-trial';

/**
 * Cooperative cancel reason. The Worker writes
 * `runs.cancel_requested_at` + `cancel_reason`; both the immediate
 * `run.cancel-acknowledged` and the terminal `run.cancelled` events carry
 * the reason verbatim.
 *
 * - `'user'`: explicit player cancel (or a Phase 0.5 navigation cancel for
 *   local runs only — the durable Worker never receives `'navigation'`).
 * - `'superseded'`: the system replaced this run (e.g. a level-up retriggered
 *   Topic Expansion before the previous run finished). Player-facing failure
 *   copy MUST be suppressed for this reason.
 */
export type CancelReason = 'user' | 'superseded';

export type TopicContentGenerationStage = 'theory' | 'study-cards' | 'mini-games' | 'full';

export type GenerationRunIntent =
  | {
      kind: 'topic-content';
      subjectId: string;
      topicId: string;
      stage: TopicContentGenerationStage;
      miniGameType?: MiniGameType;
    }
  | {
      kind: 'topic-expansion';
      subjectId: string;
      topicId: string;
      nextLevel: 1 | 2 | 3;
    }
  | {
      kind: 'subject-graph';
      subjectId: string;
      stage: 'topics';
      checklist: StudyChecklist;
    }
  | {
      kind: 'subject-graph';
      subjectId: string;
      stage: 'edges';
      latticeArtifactContentHash: string;
    }
  | {
      kind: 'crystal-trial';
      subjectId: string;
      topicId: string;
      currentLevel: number;
      targetLevel?: number;
    };

export type SubmitGenerationRunInput = GenerationRunIntent;

/**
 * Per-job snapshot. Mirrors the durable Worker's `jobs` table. `kind` is a
 * Worker job discriminator used only for backend run/debug observation.
 */
export interface JobSnapshot {
  jobId: string;
  /** Matches `ContentGenerationJobKind`. */
  kind: string;
  stage: string;
  status: 'queued' | 'streaming' | 'completed' | 'failed' | 'aborted';
  /** Set when this job is a retry of an earlier job in the same lineage. */
  retryOf?: string;
  inputHash: string;
  /** Resolved model id at job start (OpenRouter `provider/model`, e.g. `'google/gemini-3.1-flash-lite-preview'`). */
  model: string;
  /** Free-form metadata bag (`providerHealingRequested`, `structuredOutputMode`, etc.). */
  metadata?: Record<string, unknown>;
  startedAt?: number;
  finishedAt?: number;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Run snapshot returned by `getRun` / `listRuns`. `snapshotJson` is the
 * deterministic input snapshot used to compute `inputHash`. `parentRunId`
 * captures retry lineage; the Worker keeps the original on cancel + retry.
 */
export interface RunSnapshot {
  runId: string;
  /** Per-device scope; not a security boundary (Plan v3 Q2). */
  deviceId: string;
  kind: PipelineKind;
  status: RunStatus;
  inputHash: string;
  parentRunId?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  errorCode?: string;
  errorMessage?: string;
  snapshotJson: RunInputSnapshot;
  jobs: JobSnapshot[];
}

/**
 * `listRuns` query shape.
 *
 * - `status: 'active'` covers non-terminal runs (`queued` … `applied-local`).
 * - `status: 'recent'` returns terminal runs ordered by `finishedAt` desc.
 * - `status: 'all'` returns both, ordered by `createdAt` desc.
 */
export interface RunListQuery {
  status?: 'active' | 'recent' | 'all';
  limit?: number;
  kind?: PipelineKind;
  subjectId?: string;
  topicId?: string;
}

/**
 * Single contract for run submission, observation, cancel, retry, and
 * artifact retrieval. Phase 0.5 step 2 lands the local in-tab adapter that
 * wraps the existing runners; Phase 1 lands the durable adapter against the
 * Hono Worker. Both implementations honor the same monotonic per-run `seq`
 * ordering for `RunEvent`s and the same idempotency-key dedupe semantics.
 */
export interface IGenerationRunRepository {
  /**
   * Submit a new run.
   *
   * `idempotencyKey` is a per-device dedupe key:
   *   - Local adapter: 24h sliding window, returns the existing `runId` on
   *     re-submit.
   *   - Durable adapter: server-side `(device_id, idempotency_key)`
   *     uniqueness, identical re-submits return the existing `runId`.
   */
  submitRun(input: SubmitGenerationRunInput, idempotencyKey: string): Promise<{ runId: string }>;

  /** Read the latest known run state (snapshot + per-job rows). */
  getRun(runId: string): Promise<RunSnapshot>;

  /**
   * Stream `RunEvent`s for a run. `lastSeq` resumes after the given
   * sequence number; omit to start from the run's first event. The stream
   * ends after the run reaches a terminal status (`completed`, `failed-final`,
   * `cancelled`).
   */
  streamRunEvents(runId: string, lastSeq?: number): AsyncIterable<RunEvent>;

  /**
   * Cooperative cancel. Implementations MUST emit `run.cancel-acknowledged`
   * immediately and `run.cancelled` once the in-flight stage settles
   * (Plan v3 Q16: `cancel_acknowledged` ≠ terminal `cancelled`).
   */
  cancelRun(runId: string, reason: CancelReason): Promise<void>;

  /**
   * Retry a run. Returns a new `runId`; the resulting `RunSnapshot` carries
   * `parentRunId = originalRunId`. Stage- or job-scoped retries slice the
   * snapshot at the matching checkpoint (e.g. Topic Content study-cards
   * retry skips the already-applied theory artifact).
   */
  retryRun(runId: string, opts?: { stage?: string; jobId?: string }): Promise<{ runId: string }>;

  /** List runs by status / kind / subject / topic. */
  listRuns(query: RunListQuery): Promise<RunSnapshot[]>;

  /**
   * Read a persisted artifact envelope. Implementations may return either an
   * inline payload or a signed download URL (durable adapter).
   */
  getArtifact(artifactId: string): Promise<ArtifactEnvelope>;
}
