/**
 * Durable Generation Run Event Handlers — Phase 0.5 step 6.
 *
 * This is the **single sanctioned composition root** that translates
 * backend `RunEvent`s into local artifact application, legacy
 * `AppEventBus` notifications, and telemetry.
 *
 * ## Boundary rules (locked by AGENTS.md amendment)
 *
 * - Imports ONLY from feature public APIs (barrels).
 * - Must NOT deep-import feature internals, own generation rules, or
 *   perform remote I/O directly.
 * - Must NOT mutate stores except through exported feature appliers.
 * - Must NOT emit `crystal-trial:completed` — that event is
 *   exclusively the player-assessment surface.
 * - Topic Expansion supersession MUST suppress player-facing failure
 *   copy.
 * - Durable subject-graph artifacts MUST NOT be frontend-applied; they are
 *   progress-only until backend publication at `run.completed`.
 *
 * ## When this runs
 *
 * `generationRunEventHandlers` now runs against the durable Worker adapter
 * unconditionally. Local in-tab runners no longer participate in runtime
 * submission/observation; remaining local runner files are deletion targets.
 * This composition root is the sole path for artifact application and event
 * emission from generation results while the HUD projection is migrated.
 */

import { appEventBus, type AppEventBus } from './eventBus';
import type { GenerationRunIntent, PipelineKind, RunInput, RunSnapshot, SubmitGenerationRunInput } from '@/types/repository';
import type { IDeckRepository } from '@/types/repository';
import type {
  ArtifactApplier,
  ArtifactApplyContext,
  AppliedArtifactsStore,
  ArtifactEnvelope,
  ArtifactKind,
  RunEvent,
} from '@/features/generationContracts';
import type { RunEventCursorStore } from '@/infrastructure/repositories/appliedArtifactsStore';
import type { TopicLattice, TopicLatticeNode } from '@/types/topicLattice';
import type { GenerationClient } from '@/features/contentGeneration';
import type { TopicContentApplier } from '@/features/contentGeneration/appliers/topicContentApplier';
import type { TopicExpansionApplier } from '@/features/contentGeneration/appliers/topicExpansionApplier';
import type { CrystalTrialApplier } from '@/features/crystalTrial/appliers/crystalTrialApplier';
import type { PubSubClient } from './pubsub';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface GenerationRunEventHandlersDeps {
  client: GenerationClient;
  appliers: {
    topicContent: TopicContentApplier;
    topicExpansion: TopicExpansionApplier;
    crystalTrial: CrystalTrialApplier;
  };
  eventBus: AppEventBus;
  dedupeStore: AppliedArtifactsStore;
  /** Phase 3.6 Step 2: Durable per-run event cursor so rehydration survives browser reloads. */
  cursorStore: RunEventCursorStore;
  deckRepository: IDeckRepository;
  contentPublication: Pick<PubSubClient, 'publishBackendSubjectGraph'>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerationRunEventHandlers {
  /**
   * Start observing a newly submitted run. The returned promise settles
   * when the run reaches a terminal state (`run.completed`, `run.failed`,
   * or `run.cancelled`).
   *
   * The handler:
   * 1. Opens the RunEvent stream via `client.observe(runId)`.
   * 2. For locally materialized artifact kinds: fetches the artifact and
   *    applies via the appropriate applier (idempotent by `contentHash`).
   *    Durable subject-graph artifacts are progress-only and are not fetched.
   * 3. For terminal events: fires legacy `AppEventBus` events matching
   *    today's runner emissions so `eventBusHandlers.ts` listeners
   *    (mentor triggers, telemetry, HUD) continue to work.
   */
  observeRun(runId: string, runInput: SubmitGenerationRunInput): Promise<void>;

  /**
   * Returns `0` (backwards compat only). For the authoritative seq, use
   * `runEventCursorStore.get(runId)` from `appliedArtifactsStore`.
   *
   * Phase 3.6 Step 2: seq tracking is now durable via cursorStore.
   */
  getLastAppliedSeq(): number;

  /** Stop all active observations. */
  stop(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ObservedRunInput = SubmitGenerationRunInput;
type ObservedTopicContentInput = Extract<RunInput, { pipelineKind: 'topic-content' }> | Extract<GenerationRunIntent, { kind: 'topic-content' }>;
type ObservedTopicExpansionInput = Extract<RunInput, { pipelineKind: 'topic-expansion' }> | Extract<GenerationRunIntent, { kind: 'topic-expansion' }>;
type ObservedSubjectGraphInput = Extract<RunInput, { pipelineKind: 'subject-graph' }> | Extract<GenerationRunIntent, { kind: 'subject-graph' }>;
type ObservedCrystalTrialInput = Extract<RunInput, { pipelineKind: 'crystal-trial' }> | Extract<GenerationRunIntent, { kind: 'crystal-trial' }>;

function pipelineKindOf(input: ObservedRunInput): PipelineKind {
  return 'pipelineKind' in input ? input.pipelineKind : input.kind;
}

function runInputSnapshot(input: ObservedRunInput) {
  return 'snapshot' in input ? input.snapshot : undefined;
}

/**
 * Resolve a human-readable topic label from the deck.
 * Falls back to `topicId` when the deck is unavailable.
 */
async function resolveTopicLabel(
  deck: IDeckRepository,
  subjectId: string,
  topicId: string,
): Promise<string> {
  try {
    const details = await deck.getTopicDetails(subjectId, topicId);
    const graph = await deck.getSubjectGraph(subjectId);
    const node = graph.nodes.find((n) => n.topicId === topicId);
    return node?.title?.trim() || details.title?.trim() || topicId;
  } catch {
    return topicId;
  }
}

/**
 * Extract the stage tag from a `RunInput` for the
 * `topic-content:generation-completed` / `topic-content:generation-failed`
 * event payloads.
 */
function topicContentStageFromSnapshot(
  input: ObservedTopicContentInput,
): 'theory' | 'study-cards' | 'mini-games' | 'full' {
  if ('kind' in input) return input.stage;

  // Legacy stage option takes priority (supplied by in-tab callers)
  const legacy = input.topicContentLegacyOptions?.legacyStage;
  if (legacy) return legacy;

  // Derive from snapshot kind
  const pk = input.snapshot.pipeline_kind;
  if (pk === 'topic-theory') return 'theory';
  if (pk === 'topic-study-cards') return 'study-cards';
  return 'mini-games';
}

/**
 * Build the `ArtifactApplyContext` for a given run + artifact.
 */
function buildApplyContext(
  runInput: ObservedRunInput,
  runId: string,
  deviceId: string,
  dedupeStore: AppliedArtifactsStore,
): ArtifactApplyContext {
  const ctx: ArtifactApplyContext = {
    runId,
    deviceId,
    now: () => Date.now(),
    dedupeStore,
  };

  // Populate subject/topic when available
  if ('subjectId' in runInput) ctx.subjectId = runInput.subjectId;
  if ('topicId' in runInput) ctx.topicId = runInput.topicId;

  // Topic expansion supersession context
  if (
    pipelineKindOf(runInput) === 'topic-expansion' &&
    'nextLevel' in runInput
  ) {
    ctx.topicExpansionTargetLevel = runInput.nextLevel;
  }

  return ctx;
}

/**
 * Pick the right applier for an artifact kind.
 */
function pickApplier(
  kind: string,
  appliers: GenerationRunEventHandlersDeps['appliers'],
): ArtifactApplier | null {
  switch (kind) {
    case 'topic-theory':
    case 'topic-study-cards':
    case 'topic-mini-game-category-sort':
    case 'topic-mini-game-sequence-build':
    case 'topic-mini-game-match-pairs':
      return appliers.topicContent;
    case 'topic-expansion-cards':
      return appliers.topicExpansion;
    case 'subject-graph-topics':
    case 'subject-graph-edges':
      return null;
    case 'crystal-trial':
      return appliers.crystalTrial;
    default:
      return null;
  }
}

/**
 * Fire the legacy `topic-content:generation-completed` event.
 */
async function emitTopicContentCompleted(
  eventBus: AppEventBus,
  deck: IDeckRepository,
  input: ObservedTopicContentInput,
  runId: string,
): Promise<void> {
  const topicLabel = await resolveTopicLabel(
    deck,
    input.subjectId,
    input.topicId,
  );
  const stage = topicContentStageFromSnapshot(input);

  eventBus.emit('topic-content:generation-completed', {
    subjectId: input.subjectId,
    topicId: input.topicId,
    topicLabel,
    pipelineId: runId,
    stage,
  });
}

/**
 * Fire the legacy `topic-content:generation-failed` event.
 */
async function emitTopicContentFailed(
  eventBus: AppEventBus,
  deck: IDeckRepository,
  input: ObservedTopicContentInput,
  runId: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const topicLabel = await resolveTopicLabel(
    deck,
    input.subjectId,
    input.topicId,
  );
  const stage = topicContentStageFromSnapshot(input);

  eventBus.emit('topic-content:generation-failed', {
    subjectId: input.subjectId,
    topicId: input.topicId,
    topicLabel,
    pipelineId: runId,
    stage,
    errorMessage,
    failureKey: errorCode,
  });
}

/**
 * Fire the legacy `topic-expansion:generation-completed` event.
 */
async function emitTopicExpansionCompleted(
  eventBus: AppEventBus,
  deck: IDeckRepository,
  input: ObservedTopicExpansionInput,
): Promise<void> {
  const topicLabel = await resolveTopicLabel(
    deck,
    input.subjectId,
    input.topicId,
  );

  eventBus.emit('topic-expansion:generation-completed', {
    subjectId: input.subjectId,
    topicId: input.topicId,
    topicLabel,
    level: input.nextLevel,
  });
}

/**
 * Fire the legacy `topic-expansion:generation-failed` event.
 */
async function emitTopicExpansionFailed(
  eventBus: AppEventBus,
  deck: IDeckRepository,
  input: ObservedTopicExpansionInput,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const topicLabel = await resolveTopicLabel(
    deck,
    input.subjectId,
    input.topicId,
  );

  eventBus.emit('topic-expansion:generation-failed', {
    subjectId: input.subjectId,
    topicId: input.topicId,
    topicLabel,
    level: input.nextLevel,
    errorMessage,
    failureKey: errorCode,
  });
}

/**
 * Fire the legacy `subject-graph:generated` event.
 *
 * The lattice is reconstructed from the artifact payload after Stage A
 * application. If unavailable (e.g. deduped run), a minimal event fires.
 */
async function emitSubjectGraphGenerated(
  eventBus: AppEventBus,
  input: ObservedSubjectGraphInput,
  runId: string,
  runSnapshot: RunSnapshot,
): Promise<void> {
  // Derive model from the snapshot when observing a legacy local run.
  const snapshot = runInputSnapshot(input);
  const boundModel =
    snapshot && 'model_id' in snapshot
      ? (snapshot as { model_id: string }).model_id
      : 'unknown';

  // Compute durations from run timestamps
  const stageADurationMs =
    runSnapshot.startedAt && runSnapshot.finishedAt
      ? runSnapshot.finishedAt - runSnapshot.startedAt
      : 0;

  // For a local run, the lattice can be derived from the deck after
  // artifact application. For now, emit with the run-level data we have;
  // a full lattice is only available from the Stage A artifact payload.
  // The legacy subject-graph:generated handler in eventBusHandlers.ts uses
  // the lattice for topicCount telemetry and mentor triggers.
  const lattice: TopicLattice = {
    topics: [] as TopicLatticeNode[],
  };

  eventBus.emit('subject-graph:generated', {
    subjectId: input.subjectId,
    boundModel,
    stageADurationMs,
    stageBDurationMs: 0,
    retryCount: 0,
    lattice,
  });
}

/**
 * Fire the legacy `subject-graph:generation-failed` event.
 */
function emitSubjectGraphFailed(
  eventBus: AppEventBus,
  input: ObservedSubjectGraphInput,
  runId: string,
  errorCode: string,
  errorMessage: string,
): void {
  eventBus.emit('subject-graph:generation-failed', {
    subjectId: input.subjectId,
    subjectName: input.subjectId,
    pipelineId: runId,
    stage: input.stage,
    error: errorMessage,
    jobId: runId,
    failureKey: errorCode,
  });
}

/**
 * Fire the legacy `subject-graph:validation-failed` event.
 */
function emitSubjectGraphValidationFailed(
  eventBus: AppEventBus,
  input: ObservedSubjectGraphInput,
  errorCode: string,
  errorMessage: string,
): void {
  const snapshot = runInputSnapshot(input);
  const boundModel =
    snapshot && 'model_id' in snapshot
      ? (snapshot as { model_id: string }).model_id
      : 'unknown';

  eventBus.emit('subject-graph:validation-failed', {
    subjectId: input.subjectId,
    stage: input.stage,
    error: errorMessage,
    offendingTopicIds: [],
    boundModel,
    retryCount: 0,
    stageDurationMs: 0,
  });
}

/**
 * Fire the legacy `crystal-trial:generation-failed` event.
 *
 * MUST NOT fire `crystal-trial:completed` — that is the
 * player-assessment surface only.
 */
async function emitCrystalTrialFailed(
  eventBus: AppEventBus,
  deck: IDeckRepository,
  input: ObservedCrystalTrialInput,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const topicLabel = await resolveTopicLabel(
    deck,
    input.subjectId,
    input.topicId,
  );

  eventBus.emit('crystal-trial:generation-failed', {
    subjectId: input.subjectId,
    topicId: input.topicId,
    topicLabel,
    level: input.currentLevel,
    errorMessage,
    failureKey: errorCode,
  });
}

/**
 * Determine if a failure code signals a validation (not a hard LLM) error
 * for subject-graph failure routing.
 */
function isSubjectGraphValidationCode(code: string): boolean {
  return code.startsWith('validation:semantic-subject-graph') ||
    code.startsWith('parse:zod-shape') ||
    code.startsWith('parse:json-mode-violation');
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGenerationRunEventHandlers(
  deps: GenerationRunEventHandlersDeps,
): GenerationRunEventHandlers {
  const { client, appliers, eventBus, dedupeStore, cursorStore, deckRepository, contentPublication } = deps;
  const activeRuns = new Set<string>();
  let stopped = false;

  /**
   * Record the highest seq we've seen for a run.
   * Persisted durably so rehydration survives browser reloads.
   */
  async function trackSeq(runId: string, seq: number): Promise<void> {
    const prev = await cursorStore.get(runId);
    if (seq > prev) await cursorStore.set(runId, seq);
  }

  /**
   * Core observation loop. Creates an async context that reads the
   * RunEvent stream and applies artifacts + fires events.
   */
  async function observeRun(
    runId: string,
    runInput: ObservedRunInput,
  ): Promise<void> {
    if (stopped) return;
    if (activeRuns.has(runId)) return;
    activeRuns.add(runId);

    try {
      const runSnapshot = (await client.listRuns({ status: 'all', limit: 100 })).find((r) => r.runId === runId);
      const deviceId = runSnapshot?.deviceId ?? 'unknown';

      const applyCtx = buildApplyContext(
        runInput,
        runId,
        deviceId,
        dedupeStore,
      );

      // Phase 3.6 Step 2: seed startSeq from the durable cursor so SSE
      // replays only unprocessed events after a browser reload.
      const startSeq = await cursorStore.get(runId);
      let lastProcessedSeq = startSeq;
      let newArtifactsApplied = false;

      for await (const event of client.observe(runId, startSeq)) {
        if (stopped) break;
        if (event.seq <= lastProcessedSeq) continue;

        switch (event.type) {
          // ── artifact.ready: apply via applier ──────────────────
          case 'artifact.ready': {
            const { artifactId, kind } = event.body;
            const isDurableSubjectGraphArtifact =
              pipelineKindOf(runInput) === 'subject-graph' &&
              (kind === 'subject-graph-topics' || kind === 'subject-graph-edges');

            if (isDurableSubjectGraphArtifact) {
              // Durable subject-graph artifacts are progress signals only.
              // The backend publishes Learning Content atomically after both
              // stages, and canonical frontend reads are HTTP-backed.
              break;
            }

            const applier = pickApplier(kind, appliers);
            if (!applier) {
              throw new Error(
                `[generationRunEventHandlers] unknown artifact kind: ${kind} (runId=${runId})`,
              );
            }

            const artifact: ArtifactEnvelope = await client.getArtifact(artifactId);

            const result = await applier.apply(
              artifact as ArtifactEnvelope<ArtifactKind>,
              applyCtx,
            );

            if (!result.applied) {
              // suppressed: duplicate, superseded, or invalid
              if (result.reason === 'superseded') {
                // Superseded expansion — silence, per Plan v3 policy.
                // The winning run will emit the completion event.
              }
            } else {
              newArtifactsApplied = true;
            }
            break;
          }

          // ── run.completed: fire legacy completion event ────────
          case 'run.completed': {
            // Phase 3.6 Step 2: most legacy completion events are
            // product-facing artifact-application events. Durable subject-graph
            // completion is different: backend publication, not local artifact
            // application, is the content-readiness boundary.
            const runKind = pipelineKindOf(runInput);
            if (!newArtifactsApplied && runKind !== 'subject-graph') {
              break;
            }
            switch (runKind) {
              case 'topic-content':
                await emitTopicContentCompleted(
                  eventBus,
                  deckRepository,
                  runInput as ObservedTopicContentInput,
                  runId,
                );
                break;
              case 'topic-expansion':
                await emitTopicExpansionCompleted(
                  eventBus,
                  deckRepository,
                  runInput as ObservedTopicExpansionInput,
                );
                break;
              case 'subject-graph':
                contentPublication.publishBackendSubjectGraph(runInput.subjectId);
                await emitSubjectGraphGenerated(
                  eventBus,
                  runInput as ObservedSubjectGraphInput,
                  runId,
                  runSnapshot ?? {
                    runId,
                    deviceId,
                    kind: 'subject-graph',
                    status: 'applied-local',
                    inputHash: '',
                    createdAt: 0,
                    snapshotJson: (runInputSnapshot(runInput) ?? { pipeline_kind: runKind }) as RunSnapshot['snapshotJson'],
                    jobs: [],
                  },
                );
                break;
              case 'crystal-trial':
                // MUST NOT emit crystal-trial:completed (Plan v3 Q21).
                // The existing trial-availability watcher in
                // eventBusHandlers.ts fires the mentor trigger via
                // handleMentorTrigger('crystal-trial:available-for-player', ...)
                // automatically after the applier writes to the store.
                break;
            }
            break;
          }

          // ── run.failed: fire legacy failure event ──────────────
          case 'run.failed': {
            const { code, message } = event;
            switch (pipelineKindOf(runInput)) {
              case 'topic-content':
                await emitTopicContentFailed(
                  eventBus,
                  deckRepository,
                  runInput as ObservedTopicContentInput,
                  runId,
                  code,
                  message,
                );
                break;
              case 'topic-expansion':
                await emitTopicExpansionFailed(
                  eventBus,
                  deckRepository,
                  runInput as ObservedTopicExpansionInput,
                  code,
                  message,
                );
                break;
              case 'subject-graph': {
                const sgInput = runInput as ObservedSubjectGraphInput;
                if (isSubjectGraphValidationCode(code)) {
                  emitSubjectGraphValidationFailed(
                    eventBus,
                    sgInput,
                    code,
                    message,
                  );
                } else {
                  emitSubjectGraphFailed(
                    eventBus,
                    sgInput,
                    runId,
                    code,
                    message,
                  );
                }
                break;
              }
              case 'crystal-trial':
                await emitCrystalTrialFailed(
                  eventBus,
                  deckRepository,
                  runInput as ObservedCrystalTrialInput,
                  code,
                  message,
                );
                break;
            }
            break;
          }

          // ── run.cancelled: fire only for user cancel ───────────
          case 'run.cancelled': {
            if (
              event.reason === 'superseded' &&
              pipelineKindOf(runInput) === 'topic-expansion'
            ) {
              // Superseded expansion — suppress player-facing event.
            }
            // For 'user' cancel and other pipeline kinds, the
            // existing eventBusHandlers.ts listeners for failure
            // events will pick this up through the store. No separate
            // "cancel" AppEvent is defined today.
            break;
          }

          // ── lifecycle events: HUD-owned ────────────────────────
          case 'run.queued':
          case 'run.status':
          case 'stage.progress':
          case 'run.cancel-acknowledged':
            // HUD progress managed by useContentGenerationStore;
            // these events are informational from the handlers'
            // perspective.
            break;

          default: {
            const _exhaustive: never = event;
            throw new Error(
              `[generationRunEventHandlers] unhandled event type: ${(_exhaustive as RunEvent).type}`,
            );
          }
        }

        await trackSeq(runId, event.seq);
        lastProcessedSeq = Math.max(lastProcessedSeq, event.seq);
      }
    } finally {
      activeRuns.delete(runId);
    }
  }

  return {
    observeRun,
    getLastAppliedSeq(): number {
      // Phase 3.6 Step 2: seq tracking moved to durable cursorStore.
      // Callers needing the authoritative value should use cursorStore.get(runId).
      return 0;
    },
    stop() {
      stopped = true;
    },
  };
}
