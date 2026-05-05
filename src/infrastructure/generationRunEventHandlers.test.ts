/**
 * Tests for `generationRunEventHandlers.ts` — Phase 0.5 step 6.
 *
 * Covers the typed RunEvent → AppEventMap adapter:
 * - Happy-path artifact application + legacy event emission per pipeline kind.
 * - crystal-trial:completed is NEVER emitted from question generation.
 * - Superseded expansion silence (no player-facing event).
 * - Subject Graph Stage B without Stage A (missing-stage-a).
 * - Duplicate artifact idempotency.
 * - Run failure event routing (validation vs generic).
 * - Cancel/supersession event routing.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createGenerationRunEventHandlers,
  type GenerationRunEventHandlersDeps,
} from './generationRunEventHandlers';
import type { AppEventBus, AppEventMap } from './eventBus';
import type {
  ArtifactApplier,
  ArtifactEnvelope,
  AppliedArtifactsStore,
  RunEvent,
} from '@/features/generationContracts';
import type {
  GenerationClient,
  TopicContentApplier,
} from '@/features/contentGeneration';
import type { TopicExpansionApplier } from '@/features/contentGeneration/appliers/topicExpansionApplier';
import type { SubjectGraphApplier } from '@/features/subjectGeneration/appliers/subjectGraphApplier';
import type { CrystalTrialApplier } from '@/features/crystalTrial/appliers/crystalTrialApplier';
import type { IDeckRepository, RunInput, RunSnapshot } from '@/types/repository';
import type { RunInputSnapshot } from '@/features/generationContracts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock AppEventBus that records emitted events. */
function createMockEventBus(): {
  bus: AppEventBus;
  emitted: Array<{ event: string; payload: unknown }>;
} {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const bus: AppEventBus = {
    emit: ((event: string, payload: unknown) => {
      emitted.push({ event, payload });
    }) as AppEventBus['emit'],
    on: (() => () => {}) as AppEventBus['on'],
  };
  return { bus, emitted };
}

/** Create a mock DedupeStore that never has duplicates by default. */
function createMockDedupeStore(
  knownHashes?: Set<string>,
): AppliedArtifactsStore {
  const hashes = knownHashes ?? new Set<string>();
  return {
    has: vi.fn(async (hash: string) => hashes.has(hash)),
    record: vi.fn(async (_hash, _kind, _at, _scope) => {
      hashes.add(_hash);
    }),
    getLatestTopicExpansionScope: vi.fn(async () => null),
  };
}

/** Create a mock deck repository that returns canned topic details. */
function createMockDeckRepository(
  topicLabels?: Record<string, string>,
): IDeckRepository {
  const labels = topicLabels ?? {};
  return {
    getManifest: vi.fn(async () => ({ subjects: [] })),
    getSubjectGraph: vi.fn(async (subjectId: string) => ({
      subjectId,
      title: subjectId,
      themeId: 'default',
      maxTier: 3,
      nodes: [],
    })),
    getTopicDetails: vi.fn(async (_subjectId: string, topicId: string) => ({
      subjectId: _subjectId,
      topicId,
      title: labels[`${_subjectId}:${topicId}`] ?? topicId,
      coreConcept: '',
      theory: '',
      keyTakeaways: [],
      coreQuestionsByDifficulty: {} as Record<number, string[]>,
      groundingSources: [],
      lastGeneratedSchemaVersion: 1,
    })),
    getTopicCards: vi.fn(async () => []),
  };
}

/** Create an async iterable of RunEvent from an array. */
async function* runEventStream(
  events: RunEvent[],
): AsyncIterableIterator<RunEvent> {
  for (const event of events) {
    yield event;
  }
}

/** Create a mock GenerationClient that delegates to canned behaviors. */
function createMockGenerationClient(opts: {
  artifacts?: Map<string, ArtifactEnvelope>;
  activeRuns?: RunEvent[][];
  runSnapshots?: Map<string, unknown>;
}): GenerationClient {
  const artifacts = opts.artifacts ?? new Map();
  const activeRuns = opts.activeRuns ?? [];
  const runSnapshots = opts.runSnapshots ?? new Map();

  const mockObserve = vi.fn(async function* (runId: string) {
    for (const events of activeRuns) {
      if (events.length > 0 && events[0].runId === runId) {
        yield* runEventStream(events);
        return;
      }
    }
  });

  return {
    startTopicContent: vi.fn<GenerationClient['startTopicContent']>(),
    startTopicExpansion: vi.fn<GenerationClient['startTopicExpansion']>(),
    startSubjectGraph: vi.fn<GenerationClient['startSubjectGraph']>(),
    startCrystalTrial: vi.fn<GenerationClient['startCrystalTrial']>(),
    submitRun: vi.fn<GenerationClient['submitRun']>(async () => ({ runId: 'test-run-id' })),
    cancel: vi.fn<GenerationClient['cancel']>(),
    retry: vi.fn<GenerationClient['retry']>(async () => ({ runId: 'retry-run-id' })),
    observe: mockObserve as GenerationClient['observe'],
    listActive: vi.fn<GenerationClient['listActive']>(async () => []),
    listRecent: vi.fn<GenerationClient['listRecent']>(async () => []),
    getArtifact: vi.fn<GenerationClient['getArtifact']>(async (artifactId: string) => {
      const artifact = artifacts.get(artifactId);
      if (!artifact) throw new Error(`Unknown artifact: ${artifactId}`);
      return artifact;
    }),
    listRuns: vi.fn<GenerationClient['listRuns']>(async () => {
      return Array.from(runSnapshots.entries()).map(([runId, snap]) => {
        const s = snap as Record<string, unknown>;
        return {
          runId,
          deviceId: (s.deviceId as string) ?? 'test-device',
          kind: (s.kind as RunSnapshot['kind']) ?? 'topic-content',
          status: (s.status as RunSnapshot['status']) ?? 'applied-local',
          inputHash: (s.inputHash as string) ?? 'inp_test',
          createdAt: (s.createdAt as number) ?? 0,
          snapshotJson: (s.snapshotJson as RunInputSnapshot) ?? {},
          jobs: (s.jobs as RunSnapshot['jobs']) ?? [],
        } satisfies RunSnapshot;
      });
    }),
  } satisfies GenerationClient as GenerationClient;
}

/** Create a minimal inline artifact envelope for testing. */
function artifactEnvelope(
  overrides: Partial<{
    id: string;
    kind: string;
    contentHash: string;
    inputHash: string;
    payload: unknown;
  }> = {},
): Extract<ArtifactEnvelope, { kind: 'inline' }> {
  return {
    kind: 'inline' as const,
    artifact: {
      id: overrides.id ?? 'art-1',
      kind: (overrides.kind ?? 'topic-theory') as never,
      contentHash: overrides.contentHash ?? 'cnt_testhash1234',
      inputHash: overrides.inputHash ?? 'inp_testinputhash',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: new Date().toISOString(),
      payload: overrides.payload ?? { coreConcept: 'test' },
    },
  };
}

/** Build a minimal RunInput for each pipeline kind. */
function topicContentInput(
  overrides: Partial<{
    subjectId: string;
    topicId: string;
    stage: 'theory' | 'study-cards' | 'mini-games' | 'full';
  }> = {},
): Extract<RunInput, { pipelineKind: 'topic-content' }> {
  return {
    pipelineKind: 'topic-content',
    subjectId: overrides.subjectId ?? 'subj-1',
    topicId: overrides.topicId ?? 'topic-1',
    snapshot: {
      snapshot_version: 1,
      pipeline_kind: 'topic-theory' as const,
      schema_version: 1,
      prompt_template_version: 'v1',
      model_id: 'test-model',
      captured_at: new Date().toISOString(),
      subject_id: overrides.subjectId ?? 'subj-1',
      topic_id: overrides.topicId ?? 'topic-1',
      topic_title: 'Test Topic',
      learning_objective: 'Learn testing',
    },
    topicContentLegacyOptions: {
      enableReasoning: false,
      forceRegenerate: false,
      legacyStage: overrides.stage ?? 'full',
    },
  };
}

function topicExpansionInput(
  overrides: Partial<{
    subjectId: string;
    topicId: string;
    nextLevel: number;
  }> = {},
): Extract<RunInput, { pipelineKind: 'topic-expansion' }> {
  return {
    pipelineKind: 'topic-expansion',
    subjectId: overrides.subjectId ?? 'subj-1',
    topicId: overrides.topicId ?? 'topic-1',
    nextLevel: (overrides.nextLevel ?? 1) as 1 | 2 | 3,
    snapshot: {
      snapshot_version: 1,
      pipeline_kind: 'topic-expansion-cards' as const,
      schema_version: 1,
      prompt_template_version: 'v1',
      model_id: 'test-model',
      captured_at: new Date().toISOString(),
      subject_id: overrides.subjectId ?? 'subj-1',
      topic_id: overrides.topicId ?? 'topic-1',
      next_level: overrides.nextLevel ?? 1,
      difficulty: (overrides.nextLevel ?? 1) + 1,
      theory_excerpt: 'excerpt',
      syllabus_questions: ['q1', 'q2'],
      existing_card_ids: [],
      existing_concept_stems: [],
      grounding_source_count: 0,
    },
  };
}

function subjectGraphInput(
  stage: 'topics' | 'edges' = 'topics',
): Extract<RunInput, { pipelineKind: 'subject-graph' }> {
  if (stage === 'topics') {
    return {
      pipelineKind: 'subject-graph',
      subjectId: 'subj-1',
      stage: 'topics',
      snapshot: {
        snapshot_version: 1,
        pipeline_kind: 'subject-graph-topics' as const,
        schema_version: 1,
        prompt_template_version: 'v1',
        model_id: 'test-model',
        captured_at: new Date().toISOString(),
        subject_id: 'subj-1',
        checklist: { topic_name: 'Test Subject' },
        strategy_brief: {
          total_tiers: 3,
          topics_per_tier: 4,
          audience_brief: 'beginners',
          domain_brief: 'testing',
          focus_constraints: '',
        },
      },
    };
  }
  return {
    pipelineKind: 'subject-graph',
    subjectId: 'subj-1',
    stage: 'edges',
    snapshot: {
      snapshot_version: 1,
      pipeline_kind: 'subject-graph-edges' as const,
      schema_version: 1,
      prompt_template_version: 'v1',
      model_id: 'test-model',
      captured_at: new Date().toISOString(),
      subject_id: 'subj-1',
      lattice_artifact_content_hash: 'cnt_lattice123',
    },
  };
}

function crystalTrialInput(
  overrides: Partial<{
    subjectId: string;
    topicId: string;
  }> = {},
): Extract<RunInput, { pipelineKind: 'crystal-trial' }> {
  return {
    pipelineKind: 'crystal-trial',
    subjectId: overrides.subjectId ?? 'subj-1',
    topicId: overrides.topicId ?? 'topic-1',
    currentLevel: 1,
    snapshot: {
      snapshot_version: 1,
      pipeline_kind: 'crystal-trial' as const,
      schema_version: 1,
      prompt_template_version: 'v1',
      model_id: 'test-model',
      captured_at: new Date().toISOString(),
      subject_id: overrides.subjectId ?? 'subj-1',
      topic_id: overrides.topicId ?? 'topic-1',
      current_level: 1,
      target_level: 2,
      card_pool_hash: 'pool_hash',
      question_count: 5,
    },
  };
}

/** Build a RunEvent. */
function evt(
  runId: string,
  seq: number,
  overrides: Partial<RunEvent> & { type: RunEvent['type'] },
): RunEvent {
  const ts = new Date().toISOString();
  const base = { runId, seq, ts };
  if (overrides.type === 'run.queued') return { ...base, type: 'run.queued' } as RunEvent;
  if (overrides.type === 'run.status') return { ...base, type: 'run.status', status: (overrides as { status: string }).status ?? 'planning' } as RunEvent;
  if (overrides.type === 'stage.progress') return { ...base, type: 'stage.progress', body: (overrides as { body: Record<string, unknown> }).body ?? { stage: 'theory' } } as RunEvent;
  if (overrides.type === 'artifact.ready') return { ...base, type: 'artifact.ready', body: (overrides as { body: Record<string, unknown> }).body ?? { artifactId: 'art-1', kind: 'topic-theory', contentHash: 'cnt_hash', schemaVersion: 1, inputHash: 'inp_hash' } } as RunEvent;
  if (overrides.type === 'run.completed') return { ...base, type: 'run.completed' } as RunEvent;
  if (overrides.type === 'run.failed') return { ...base, type: 'run.failed', code: (overrides as { code: string }).code ?? 'llm:unknown', message: (overrides as { message: string }).message ?? 'error' } as RunEvent;
  if (overrides.type === 'run.cancel-acknowledged') return { ...base, type: 'run.cancel-acknowledged', reason: (overrides as { reason: 'user' | 'superseded' }).reason ?? 'user' } as RunEvent;
  if (overrides.type === 'run.cancelled') return { ...base, type: 'run.cancelled', reason: (overrides as { reason: 'user' | 'superseded' }).reason ?? 'user' } as RunEvent;
  return { ...base, ...(overrides as Record<string, unknown>) } as RunEvent;
}

/** Create a mock applier that always applies successfully. */
function createMockApplier(
  kind: string,
  applyResult?: { applied: boolean; reason?: 'duplicate' | 'superseded' | 'missing-stage-a' | 'invalid' },
): ArtifactApplier {
  return {
    kind: kind as ArtifactApplier['kind'],
    apply: vi.fn(async () => applyResult ?? { applied: true }),
  } as unknown as ArtifactApplier;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generationRunEventHandlers', () => {
  let handlersDeps: GenerationRunEventHandlersDeps;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockDedupe: AppliedArtifactsStore;
  let mockDeck: IDeckRepository;
  let mockClient: GenerationClient;
  let tfApplier: ArtifactApplier;
  let teApplier: ArtifactApplier;
  let sgApplier: ArtifactApplier;
  let ctApplier: ArtifactApplier;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockDedupe = createMockDedupeStore();
    mockDeck = createMockDeckRepository({
      'subj-1:topic-1': 'Test Topic',
    });
    tfApplier = createMockApplier('topic-theory');
    teApplier = createMockApplier('topic-expansion-cards');
    sgApplier = createMockApplier('subject-graph-topics');
    ctApplier = createMockApplier('crystal-trial');
  });

  function buildDeps(
    overrides: Partial<{
      client: GenerationClient;
      eventBus: AppEventBus;
    }> = {},
  ): GenerationRunEventHandlersDeps {
    mockClient = overrides.client ?? createMockGenerationClient({
      artifacts: new Map([['art-1', artifactEnvelope()]]),
    });
    return {
      client: mockClient,
      appliers: {
        topicContent: tfApplier as TopicContentApplier,
        topicExpansion: teApplier as TopicExpansionApplier,
        subjectGraph: sgApplier as SubjectGraphApplier,
        crystalTrial: ctApplier as CrystalTrialApplier,
      },
      eventBus: overrides.eventBus ?? mockEventBus.bus,
      dedupeStore: mockDedupe,
      deckRepository: mockDeck,
    };
  }

  // ── Topic Content happy path ──────────────────────────────────

  it('applies topic-theory artifact and emits topic-content:generation-completed', async () => {
    const input = topicContentInput({ stage: 'full' });
    const runId = 'run-tc-1';

    const client = createMockGenerationClient({
      artifacts: new Map([['art-tc-1', artifactEnvelope({ id: 'art-tc-1', kind: 'topic-theory', contentHash: 'cnt_tc1' })]]),
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'artifact.ready', body: { artifactId: 'art-tc-1', kind: 'topic-theory', contentHash: 'cnt_tc1', schemaVersion: 1, inputHash: 'inp_tc', subjectId: 'subj-1', topicId: 'topic-1' } }),
        evt(runId, 3, { type: 'run.completed' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-content', status: 'applied-local', inputHash: 'inp_tc', createdAt: 1000, startedAt: 1000, finishedAt: 5000, snapshotJson: input.snapshot, jobs: [] }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    // Artifact was applied
    expect(tfApplier.apply).toHaveBeenCalled();

    // Completion event emitted
    const completedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'topic-content:generation-completed',
    );
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.payload).toMatchObject({
      subjectId: 'subj-1',
      topicId: 'topic-1',
      stage: 'full',
    });

    handlers.stop();
  });

  it('emits topic-content:generation-failed on run.failed', async () => {
    const input = topicContentInput({ stage: 'theory' });
    const runId = 'run-tc-fail-1';

    const client = createMockGenerationClient({
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'run.failed', code: 'llm:rate-limit' as never, message: 'Rate limited' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-content', status: 'failed-final' }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    const failedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'topic-content:generation-failed',
    );
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.payload).toMatchObject({
      subjectId: 'subj-1',
      topicId: 'topic-1',
      stage: 'theory',
      errorMessage: 'Rate limited',
    });

    handlers.stop();
  });

  // ── Topic Expansion happy path ──────────────────────────────────

  it('applies topic-expansion-cards artifact and emits topic-expansion:generation-completed', async () => {
    const input = topicExpansionInput({ nextLevel: 1 });
    const runId = 'run-te-1';

    const client = createMockGenerationClient({
      artifacts: new Map([['art-te-1', artifactEnvelope({ id: 'art-te-1', kind: 'topic-expansion-cards', contentHash: 'cnt_te1' })]]),
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'artifact.ready', body: { artifactId: 'art-te-1', kind: 'topic-expansion-cards', contentHash: 'cnt_te1', schemaVersion: 1, inputHash: 'inp_te', subjectId: 'subj-1', topicId: 'topic-1' } }),
        evt(runId, 3, { type: 'run.completed' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-expansion', status: 'applied-local', inputHash: 'inp_te', createdAt: 1000, startedAt: 1000, finishedAt: 3000, snapshotJson: input.snapshot, jobs: [] }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    expect(teApplier.apply).toHaveBeenCalled();

    const completedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'topic-expansion:generation-completed',
    );
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.payload).toMatchObject({
      subjectId: 'subj-1',
      topicId: 'topic-1',
      level: 1,
    });

    handlers.stop();
  });

  it('suppresses player-facing event for superseded expansion on run.cancelled with reason superseded', async () => {
    const input = topicExpansionInput({ nextLevel: 1 });
    const runId = 'run-te-superseded';

    const client = createMockGenerationClient({
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'run.cancel-acknowledged', reason: 'superseded' }),
        evt(runId, 3, { type: 'run.cancelled', reason: 'superseded' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-expansion', status: 'cancelled' }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    // No topic-expansion:generation-failed should fire for supersession
    const failedEvents = mockEventBus.emitted.filter(
      (e) =>
        e.event === 'topic-expansion:generation-failed' ||
        e.event === 'topic-expansion:generation-completed',
    );
    expect(failedEvents).toHaveLength(0);

    handlers.stop();
  });

  it('emits topic-expansion:generation-failed on run.failed', async () => {
    const input = topicExpansionInput({ nextLevel: 2 });
    const runId = 'run-te-fail-1';

    const client = createMockGenerationClient({
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'run.failed', code: 'llm:upstream-5xx' as never, message: 'Server error' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-expansion', status: 'failed-final' }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    const failedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'topic-expansion:generation-failed',
    );
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.payload).toMatchObject({
      level: 2,
      errorMessage: 'Server error',
    });

    handlers.stop();
  });

  // ── Subject Graph happy path ──────────────────────────────────

  it('applies subject-graph-topics artifact and emits subject-graph:generated', async () => {
    const input = subjectGraphInput('topics');
    const runId = 'run-sg-1';

    const client = createMockGenerationClient({
      artifacts: new Map([['art-sg-1', artifactEnvelope({ id: 'art-sg-1', kind: 'subject-graph-topics', contentHash: 'cnt_sg1' })]]),
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'artifact.ready', body: { artifactId: 'art-sg-1', kind: 'subject-graph-topics', contentHash: 'cnt_sg1', schemaVersion: 1, inputHash: 'inp_sg', subjectId: 'subj-1' } }),
        evt(runId, 3, { type: 'run.completed' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'subject-graph', status: 'applied-local', inputHash: 'inp_sg', createdAt: 1000, startedAt: 1000, finishedAt: 4000, snapshotJson: input.snapshot, jobs: [] }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    expect(sgApplier.apply).toHaveBeenCalled();

    const generatedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'subject-graph:generated',
    );
    expect(generatedEvent).toBeDefined();
    expect(generatedEvent?.payload).toMatchObject({
      subjectId: 'subj-1',
      boundModel: 'test-model',
    });

    handlers.stop();
  });

  it('emits subject-graph:generation-failed on run.failed with non-validation code', async () => {
    const input = subjectGraphInput('edges');
    const runId = 'run-sg-fail-1';

    const client = createMockGenerationClient({
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'run.failed', code: 'llm:rate-limit' as never, message: 'Rate limited' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'subject-graph', status: 'failed-final' }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    const failedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'subject-graph:generation-failed',
    );
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.payload).toMatchObject({
      subjectId: 'subj-1',
      stage: 'edges',
    });

    // Should NOT fire validation-failed for non-validation codes
    const validationEvent = mockEventBus.emitted.find(
      (e) => e.event === 'subject-graph:validation-failed',
    );
    expect(validationEvent).toBeUndefined();

    handlers.stop();
  });

  it('emits subject-graph:validation-failed on run.failed with validation code', async () => {
    const input = subjectGraphInput('edges');
    const runId = 'run-sg-val-fail-1';

    const client = createMockGenerationClient({
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'run.failed', code: 'parse:json-mode-violation' as never, message: 'Invalid JSON' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'subject-graph', status: 'failed-final' }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    const validationEvent = mockEventBus.emitted.find(
      (e) => e.event === 'subject-graph:validation-failed',
    );
    expect(validationEvent).toBeDefined();
    expect(validationEvent?.payload).toMatchObject({
      subjectId: 'subj-1',
      stage: 'edges',
      error: 'Invalid JSON',
    });

    // Should NOT fire generation-failed for validation codes
    const failedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'subject-graph:generation-failed',
    );
    expect(failedEvent).toBeUndefined();

    handlers.stop();
  });

  // ── Crystal Trial ─────────────────────────────────────────────

  it('applies crystal-trial artifact and does NOT emit crystal-trial:completed', async () => {
    const input = crystalTrialInput();
    const runId = 'run-ct-1';

    const client = createMockGenerationClient({
      artifacts: new Map([['art-ct-1', artifactEnvelope({ id: 'art-ct-1', kind: 'crystal-trial', contentHash: 'cnt_ct1' })]]),
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'artifact.ready', body: { artifactId: 'art-ct-1', kind: 'crystal-trial', contentHash: 'cnt_ct1', schemaVersion: 1, inputHash: 'inp_ct', subjectId: 'subj-1', topicId: 'topic-1' } }),
        evt(runId, 3, { type: 'run.completed' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'crystal-trial', status: 'applied-local', inputHash: 'inp_ct', createdAt: 1000, snapshotJson: input.snapshot, jobs: [] }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    expect(ctApplier.apply).toHaveBeenCalled();

    // MUST NOT emit crystal-trial:completed (Plan v3 Q21 drift-prevention pin)
    const completedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'crystal-trial:completed',
    );
    expect(completedEvent).toBeUndefined();

    handlers.stop();
  });

  it('emits crystal-trial:generation-failed on run.failed', async () => {
    const input = crystalTrialInput();
    const runId = 'run-ct-fail-1';

    const client = createMockGenerationClient({
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'run.failed', code: 'llm:unknown' as never, message: 'Generation failed' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'crystal-trial', status: 'failed-final' }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    const failedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'crystal-trial:generation-failed',
    );
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.payload).toMatchObject({
      subjectId: 'subj-1',
      topicId: 'topic-1',
      level: 1,
      errorMessage: 'Generation failed',
    });

    // MUST NOT emit crystal-trial:completed on failure either
    const completedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'crystal-trial:completed',
    );
    expect(completedEvent).toBeUndefined();

    handlers.stop();
  });

  // ── Duplicate/idempotency ─────────────────────────────────────

  it('does not re-apply duplicate artifacts (idempotent by contentHash)', async () => {
    const input = topicContentInput({ stage: 'full' });
    const runId = 'run-dup-1';
    const CONTENT_HASH = 'cnt_dup1';

    // Pre-seed dedupe store with the hash
    const dedupeWithHash = createMockDedupeStore(new Set([CONTENT_HASH]));
    const applySpy = vi.fn(async () => ({ applied: false, reason: 'duplicate' as const }));
    const dupeApplier = { kind: 'topic-theory', apply: applySpy };

    const client = createMockGenerationClient({
      artifacts: new Map([['art-dup-1', artifactEnvelope({ id: 'art-dup-1', kind: 'topic-theory', contentHash: CONTENT_HASH })]]),
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'artifact.ready', body: { artifactId: 'art-dup-1', kind: 'topic-theory', contentHash: CONTENT_HASH, schemaVersion: 1, inputHash: 'inp_dup', subjectId: 'subj-1', topicId: 'topic-1' } }),
        evt(runId, 3, { type: 'run.completed' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-content', status: 'applied-local' }]]),
    });

    const handlers = createGenerationRunEventHandlers({
      client,
      appliers: {
        topicContent: dupeApplier as TopicContentApplier,
        topicExpansion: teApplier as TopicExpansionApplier,
        subjectGraph: sgApplier as SubjectGraphApplier,
        crystalTrial: ctApplier as CrystalTrialApplier,
      },
      eventBus: mockEventBus.bus,
      dedupeStore: dedupeWithHash,
      deckRepository: mockDeck,
    });

    await handlers.observeRun(runId, input);

    // Applier was called but returned duplicate
    expect(applySpy).toHaveBeenCalled();
    // Completion event still fires (run succeeded, just deduped)
    const completedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'topic-content:generation-completed',
    );
    expect(completedEvent).toBeDefined();

    handlers.stop();
  });

  // ── stop() ────────────────────────────────────────────────────

  it('stop() prevents new observations and halts in-flight loops', async () => {
    const input = topicContentInput();
    const runId = 'run-stop-1';

    // A stream that never terminates (to test stop)
    let resolveNever!: () => void;
    const neverPromise = new Promise<void>((r) => { resolveNever = r; });

    const client = createMockGenerationClient({
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-content' }]]),
    });

    // Override observe to block indefinitely — cast through unknown for the mock
    type ObserveFn = (runId: string, lastSeq?: number) => AsyncIterable<RunEvent>;
    (client as unknown as { observe: ObserveFn }).observe = vi.fn(
      async function* () {
        yield evt(runId, 1, { type: 'run.queued' });
        await neverPromise;
      },
    ) as unknown as ObserveFn;

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    // Start observation (don't await it)
    const observePromise = handlers.observeRun(runId, input);

    // Wait a tick then stop
    await new Promise((r) => setTimeout(r, 10));
    handlers.stop();
    resolveNever();

    await observePromise;

    // After stop, new observations should not be started
    await handlers.observeRun('run-stop-2', input);
    // No error thrown, just a no-op
  });

  // ── Missing Stage A for subject-graph edges ───────────────────

  it('subject-graph stage-b with missing-stage-a returns reason from applier', async () => {
    const input = subjectGraphInput('edges');
    const runId = 'run-sg-b-no-a';
    const CONTENT_HASH = 'cnt_sg_b1';

    const applierResult = { applied: false, reason: 'missing-stage-a' as const };
    const sgApplierSpy = createMockApplier('subject-graph-topics', applierResult);

    const client = createMockGenerationClient({
      artifacts: new Map([['art-sg-b-1', artifactEnvelope({ id: 'art-sg-b-1', kind: 'subject-graph-edges', contentHash: CONTENT_HASH })]]),
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'artifact.ready', body: { artifactId: 'art-sg-b-1', kind: 'subject-graph-edges', contentHash: CONTENT_HASH, schemaVersion: 1, inputHash: 'inp_sg_b', subjectId: 'subj-1' } }),
        evt(runId, 3, { type: 'run.completed' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'subject-graph', status: 'applied-local', inputHash: 'inp_sg_b', createdAt: 1000, startedAt: 1000, finishedAt: 2000, snapshotJson: input.snapshot, jobs: [] }]]),
    });

    const handlers = createGenerationRunEventHandlers({
      client,
      appliers: {
        topicContent: tfApplier as TopicContentApplier,
        topicExpansion: teApplier as TopicExpansionApplier,
        subjectGraph: sgApplierSpy as SubjectGraphApplier,
        crystalTrial: ctApplier as CrystalTrialApplier,
      },
      eventBus: mockEventBus.bus,
      dedupeStore: mockDedupe,
      deckRepository: mockDeck,
    });

    await handlers.observeRun(runId, input);

    expect(sgApplierSpy.apply).toHaveBeenCalled();
    // Event still fires (run completed; missing-stage-a is applier concern)
    const generatedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'subject-graph:generated',
    );
    expect(generatedEvent).toBeDefined();

    handlers.stop();
  });

  // ── Unknown artifact kind ─────────────────────────────────────

  it('logs error for unknown artifact kind but does not crash', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = topicContentInput();
    const runId = 'run-unknown-kind';

    const client = createMockGenerationClient({
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'artifact.ready', body: { artifactId: 'art-unknown', kind: 'unknown-kind', contentHash: 'cnt_unk', schemaVersion: 1, inputHash: 'inp_unk', subjectId: 'subj-1', topicId: 'topic-1' } }),
        evt(runId, 3, { type: 'run.completed' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-content', status: 'applied-local', inputHash: 'inp_unk', createdAt: 1000, snapshotJson: input.snapshot, jobs: [] }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    // Should log warning but not crash
    expect(consoleErrorSpy).toHaveBeenCalled();
    const warningCall = consoleErrorSpy.mock.calls.find((c) =>
      String(c[0]).includes('unknown artifact kind'),
    );
    expect(warningCall).toBeDefined();

    // Completion event still fires (artifact failure shouldn't block terminal)
    const completedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'topic-content:generation-completed',
    );
    expect(completedEvent).toBeDefined();

    handlers.stop();
    consoleErrorSpy.mockRestore();
  });

  // ── Artifact fetch failure ────────────────────────────────────

  it('logs error on artifact fetch failure and continues', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = topicContentInput();
    const runId = 'run-art-fail';

    const client = createMockGenerationClient({
      // No artifact for art-missing
      artifacts: new Map(),
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'artifact.ready', body: { artifactId: 'art-missing', kind: 'topic-theory', contentHash: 'cnt_missing', schemaVersion: 1, inputHash: 'inp_miss', subjectId: 'subj-1', topicId: 'topic-1' } }),
        evt(runId, 3, { type: 'run.completed' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-content', status: 'applied-local' }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    // Should log error about missing artifact
    const errorCall = consoleErrorSpy.mock.calls.find((c) =>
      String(c[0]).includes('failed to fetch artifact'),
    );
    expect(errorCall).toBeDefined();

    // Completion event still fires
    const completedEvent = mockEventBus.emitted.find(
      (e) => e.event === 'topic-content:generation-completed',
    );
    expect(completedEvent).toBeDefined();

    handlers.stop();
    consoleErrorSpy.mockRestore();
  });

  // ── getLastAppliedSeq (Phase 1 PR-F) ─────────────────────────

  it('getLastAppliedSeq returns 0 for an unknown run', () => {
    const handlers = createGenerationRunEventHandlers(buildDeps());
    expect(handlers.getLastAppliedSeq('never-seen-run')).toBe(0);
    handlers.stop();
  });

  it('getLastAppliedSeq tracks seq as events are processed', async () => {
    const input = topicContentInput();
    const runId = 'run-seq-track';
    const hash = 'cnt_seq_hash';

    const client = createMockGenerationClient({
      activeRuns: [[
        evt(runId, 1, { type: 'run.queued' }),
        evt(runId, 2, { type: 'run.status', status: 'generating-stage' }),
        evt(runId, 5, { type: 'artifact.ready', body: { artifactId: 'art-seq', kind: 'topic-theory', contentHash: hash, schemaVersion: 1, inputHash: 'inp_seq', subjectId: 'subj-1', topicId: 'topic-1' } }),
        evt(runId, 7, { type: 'run.completed' }),
      ]],
      artifacts: new Map([['art-seq', artifactEnvelope({ id: 'art-seq', kind: 'topic-theory', contentHash: hash })]]),
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-content', status: 'applied-local', inputHash: 'inp_seq', createdAt: 1000, snapshotJson: input.snapshot, jobs: [] }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    // Before observation, seq should be 0.
    expect(handlers.getLastAppliedSeq(runId)).toBe(0);

    await handlers.observeRun(runId, input);

    // After observation completes, seq should be the last event seq (7).
    expect(handlers.getLastAppliedSeq(runId)).toBe(7);

    handlers.stop();
  });

  it('getLastAppliedSeq is monotonic and never decreases', async () => {
    const input = topicContentInput();
    const runId = 'run-mono';

    const client = createMockGenerationClient({
      activeRuns: [[
        evt(runId, 3, { type: 'run.queued' }),
        evt(runId, 1, { type: 'run.status', status: 'generating-stage' }), // out-of-order lower seq
        evt(runId, 5, { type: 'run.completed' }),
      ]],
      runSnapshots: new Map([[runId, { runId, deviceId: 'dev-1', kind: 'topic-content', status: 'applied-local', inputHash: 'inp_mono', createdAt: 1000, snapshotJson: input.snapshot, jobs: [] }]]),
    });

    const handlers = createGenerationRunEventHandlers(
      buildDeps({ client }),
    );

    await handlers.observeRun(runId, input);

    // Should be 5 (max of 3, 1, 5) not 1.
    expect(handlers.getLastAppliedSeq(runId)).toBe(5);

    handlers.stop();
  });
});
