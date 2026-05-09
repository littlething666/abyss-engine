/**
 * Durable Generation Run Event Handlers.
 *
 * This is the **single sanctioned composition root** that translates backend
 * `RunEvent`s into Learning Content Store query invalidation, legacy
 * `AppEventBus` notifications, and telemetry.
 *
 * ## Boundary rules (locked by AGENTS.md amendment)
 *
 * - Imports ONLY from feature public APIs (barrels).
 * - Must NOT deep-import feature internals, own generation rules, or
 *   perform remote I/O directly.
 * - Must NOT mutate generated-content stores; backend workflows publish generated artifacts.
 * - Must NOT emit `crystal-trial:completed` — that event is
 *   exclusively the player-assessment surface.
 * - Topic Expansion supersession MUST suppress player-facing failure
 *   copy.
 * - Durable artifacts MUST NOT be frontend-applied; `artifact.ready` is a
 *   progress signal until backend publication is observed at `run.completed`.
 *
 * ## When this runs
 *
 * `generationRunEventHandlers` now runs against the durable Worker adapter
 * unconditionally. Local in-tab runners no longer participate in runtime
 * submission/observation; remaining local runner files are deletion targets.
 * This composition root consumes durable events only to refresh backend-owned
 * content projections and emit product notifications.
 */

import { appEventBus, type AppEventBus } from './eventBus';
import type { GenerationRunIntent, PipelineKind, RunSnapshot, SubmitGenerationRunInput } from '@/types/repository';
import type { IDeckRepository } from '@/types/repository';
import type { RunEvent } from '@/features/generationContracts';
import type { RunEventCursorStore } from '@/infrastructure/repositories/runEventCursorStore';
import type { TopicLattice, TopicLatticeNode } from '@/types/topicLattice';
import type { GenerationClient } from '@/features/contentGeneration';
import type { PubSubClient } from './pubsub';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface GenerationRunEventHandlersDeps {
  client: GenerationClient;
  eventBus: AppEventBus;
  /** Phase 3.6 Step 2: Durable per-run event cursor so rehydration survives browser reloads. */
  cursorStore: RunEventCursorStore;
  deckRepository: IDeckRepository;
  contentPublication: Pick<PubSubClient, 'publishBackendSubjectGraph' | 'publishTopicContent' | 'publishTopicCards' | 'publishCrystalTrial'>;
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
   * `runEventCursorStore.get(runId)` from `runEventCursorStore`.
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
type ObservedTopicContentInput = Extract<GenerationRunIntent, { kind: 'topic-content' }>;
type ObservedTopicExpansionInput = Extract<GenerationRunIntent, { kind: 'topic-expansion' }>;
type ObservedSubjectGraphInput = Extract<GenerationRunIntent, { kind: 'subject-graph' }>;
type ObservedCrystalTrialInput = Extract<GenerationRunIntent, { kind: 'crystal-trial' }>;

function pipelineKindOf(input: ObservedRunInput): PipelineKind {
  return input.kind;
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
 * Extract the stage tag from a durable intent for the
 * `topic-content:generation-completed` / `topic-content:generation-failed`
 * event payloads.
 */
function topicContentStageFromIntent(
  input: ObservedTopicContentInput,
): 'theory' | 'study-cards' | 'mini-games' | 'full' {
  return input.stage;
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
  const stage = topicContentStageFromIntent(input);

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
  const stage = topicContentStageFromIntent(input);

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
  const boundModel = 'backend-policy';

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
  const boundModel = 'backend-policy';

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
  const { client, eventBus, cursorStore, deckRepository, contentPublication } = deps;
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

      // Phase 3.6 Step 2: seed startSeq from the durable cursor so SSE
      // replays only unprocessed events after a browser reload.
      const startSeq = await cursorStore.get(runId);
      let lastProcessedSeq = startSeq;

      for await (const event of client.observe(runId, startSeq)) {
        if (stopped) break;
        if (event.seq <= lastProcessedSeq) continue;

        switch (event.type) {
          // ── artifact.ready: progress signal only ───────────────
          case 'artifact.ready':
            // Backend workflows already apply artifacts to the Learning
            // Content Store. Fetching artifacts here would recreate a second
            // frontend write path and drift from durable authority.
            break;

          // ── run.completed: refresh backend content reads ───────
          case 'run.completed': {
            const runKind = pipelineKindOf(runInput);
            switch (runKind) {
              case 'topic-content': {
                const input = runInput as ObservedTopicContentInput;
                contentPublication.publishTopicContent(input.subjectId, input.topicId);
                await emitTopicContentCompleted(
                  eventBus,
                  deckRepository,
                  input,
                  runId,
                );
                break;
              }
              case 'topic-expansion': {
                const input = runInput as ObservedTopicExpansionInput;
                contentPublication.publishTopicCards(input.subjectId, input.topicId);
                await emitTopicExpansionCompleted(
                  eventBus,
                  deckRepository,
                  input,
                );
                break;
              }
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
                    snapshotJson: { pipeline_kind: runKind } as unknown as RunSnapshot['snapshotJson'],
                    jobs: [],
                  },
                );
                break;
              case 'crystal-trial': {
                const input = runInput as ObservedCrystalTrialInput;
                contentPublication.publishCrystalTrial(input.subjectId, input.topicId);
                // MUST NOT emit crystal-trial:completed (Plan v3 Q21).
                break;
              }
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

          // ── lifecycle events: durable diagnostics-owned ────────
          case 'run.queued':
          case 'run.status':
          case 'stage.progress':
          case 'run.cancel-acknowledged':
            // Backend run/debug endpoints own progress diagnostics; these
            // events are informational from the handlers' perspective.
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
