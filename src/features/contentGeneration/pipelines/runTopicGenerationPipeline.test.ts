import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MiniGameType } from '@/types/core';
import { runTopicGenerationPipeline } from './runTopicGenerationPipeline';
import { useContentGenerationStore } from '../contentGenerationStore';
import { topicRefKey } from '@/lib/topicRef';
import type { Card, SubjectGraph, TopicDetails } from '@/types/core';
import type { IChatCompletionsRepository } from '@/types/llm';
import type {
  IDeckRepository,
  IDeckContentWriter,
} from '@/types/repository';
import { appEventBus } from '@/infrastructure/eventBus';
import { failureKeyForJob } from '../failureKeys';
import { parseTopicCardsPayload } from '../parsers/parseTopicCardsPayload';
import { buildTopicMiniGameCardsResponseFormat } from '../schemas/topicMiniGameCardsResponseFormat';
import { topicTheoryStructuredOutputResponseFormat } from '../schemas/topicTheoryResponseFormat';

const { surfaceProvidersApi } = vi.hoisted(() => ({
  surfaceProvidersApi: {
    resolveModelForSurface: vi.fn(() => 'mock-model'),
    resolveEnableReasoningForSurface: vi.fn(() => false),
    resolveEnableStreamingForSurface: vi.fn(() => false),
  },
}));

vi.mock('@/infrastructure/llmInferenceSurfaceProviders', () => surfaceProvidersApi);

const { celebrationApi } = vi.hoisted(() => ({
  celebrationApi: {
    markPendingFromFullTopicUnlock: vi.fn(),
    consumePendingCelebrationKey: vi.fn(),
    setLastFinalizedTopic: vi.fn(),
  },
}));

vi.mock('@/store/crystalContentCelebrationStore', () => ({
  useCrystalContentCelebrationStore: {
    getState: () => celebrationApi,
  },
}));

const { telemetryApi } = vi.hoisted(() => ({
  telemetryApi: {
    log: vi.fn(),
  },
}));

// `runTopicGenerationPipeline` imports `{ telemetry }` from
// `@/features/telemetry`. Mocking it here bypasses the dev-mode payload
// validation guard inside `telemetry.log` so the tests can assert on the
// exact call shape without producing real telemetry events.
vi.mock('@/features/telemetry', () => ({
  telemetry: telemetryApi,
}));

const runContentGenerationJob = vi.fn();

vi.mock('../runContentGenerationJob', () => ({
  runContentGenerationJob: (...args: unknown[]) => runContentGenerationJob(...args),
}));

const graph: SubjectGraph = {
  subjectId: 'sub-1',
  title: 'Subject',
  themeId: 'th',
  maxTier: 1,
  nodes: [
    {
      topicId: 't-a',
      title: 'Topic A',
      tier: 1,
      prerequisites: [],
      learningObjective: 'objective',
      iconName: 'lightbulb',
    },
  ],
};

const readyDetails: TopicDetails = {
  topicId: 't-a',
  title: 'Topic A',
  subjectId: 'sub-1',
  coreConcept: 'cc',
  theory: 'theory body',
  keyTakeaways: ['k1', 'k2', 'k3', 'k4'],
  coreQuestionsByDifficulty: {
    1: ['q1', 'q2', 'q3'],
    2: ['q1', 'q2', 'q3'],
    3: ['q1', 'q2', 'q3'],
    4: ['q1', 'q2', 'q3'],
  },
  groundingSources: [],
};

const readyCards: Card[] = Array.from({ length: 6 }, (_, i) => ({
  id: `c-${i}`,
  type: 'FLASHCARD',
  difficulty: 1,
  content: { front: 'f', back: 'b' },
}));

/**
 * Theory payload fixture used by the faithful `runContentGenerationJob`
 * mock when emulating the topic-theory stage. Mirrors the production
 * `ParsedTopicTheoryContentPayload` shape so `runTopicGenerationPipeline`'s
 * `resolveTheoryData()` returns this and downstream stages run as in
 * production.
 */
const FIXTURE_THEORY_DATA = {
  coreConcept: 'cc',
  theory: 'theory body',
  keyTakeaways: ['k1', 'k2', 'k3', 'k4'],
  coreQuestionsByDifficulty: {
    1: ['q1', 'q2', 'q3'],
    2: ['q1', 'q2', 'q3'],
    3: ['q1', 'q2', 'q3'],
    4: ['q1', 'q2', 'q3'],
  },
  groundingSources: [],
};

function stubMiniCardsForJobKind(kind: string): Card[] {
  const wrap = (cards: unknown[]) => JSON.stringify({ cards });
  if (kind === 'topic-mini-game-category-sort') {
    const r = parseTopicCardsPayload(
      wrap([
        {
          id: 't-a-stub-cat',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'CATEGORY_SORT',
            prompt: 'Sort',
            explanation: 'E',
            categories: [
              { id: 'a', label: 'A' },
              { id: 'b', label: 'B' },
              { id: 'c', label: 'C' },
            ],
            items: [
              { id: 'i0', label: 'l0', categoryId: 'a' },
              { id: 'i1', label: 'l1', categoryId: 'a' },
              { id: 'i2', label: 'l2', categoryId: 'b' },
              { id: 'i3', label: 'l3', categoryId: 'b' },
              { id: 'i4', label: 'l4', categoryId: 'c' },
              { id: 'i5', label: 'l5', categoryId: 'c' },
            ],
          },
        },
      ]),
      { allowedCardTypes: ['MINI_GAME'], allowedMiniGameTypes: ['CATEGORY_SORT'] },
    );
    if (!r.ok) throw new Error(r.error);
    return r.cards;
  }
  if (kind === 'topic-mini-game-sequence-build') {
    const r = parseTopicCardsPayload(
      wrap([
        {
          id: 't-a-stub-seq',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'SEQUENCE_BUILD',
            prompt: 'Order',
            explanation: 'E',
            items: [
              { id: 's0', label: 'a', correctPosition: 0 },
              { id: 's1', label: 'b', correctPosition: 1 },
              { id: 's2', label: 'c', correctPosition: 2 },
            ],
          },
        },
      ]),
      { allowedCardTypes: ['MINI_GAME'], allowedMiniGameTypes: ['SEQUENCE_BUILD'] },
    );
    if (!r.ok) throw new Error(r.error);
    return r.cards;
  }
  if (kind === 'topic-mini-game-connection-web') {
    const r = parseTopicCardsPayload(
      wrap([
        {
          id: 't-a-stub-web',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'CONNECTION_WEB',
            prompt: 'Match',
            explanation: 'E',
            pairs: [
              { id: 'p0', left: 'L0', right: 'R0' },
              { id: 'p1', left: 'L1', right: 'R1' },
              { id: 'p2', left: 'L2', right: 'R2' },
            ],
          },
        },
      ]),
      { allowedCardTypes: ['MINI_GAME'], allowedMiniGameTypes: ['CONNECTION_WEB'] },
    );
    if (!r.ok) throw new Error(r.error);
    return r.cards;
  }
  throw new Error(`unexpected mini job kind ${kind}`);
}

/**
 * Faithful default for the `runContentGenerationJob` mock: invokes
 * `persistOutput` with realistic per-stage data before resolving ok.
 * The earlier `mockResolvedValue({ ok: true })` shortcut left
 * `theoryData` undefined inside the pipeline, so `resolveTheoryData()`
 * fell back to `loadTheoryPayloadFromTopicDetails(details = null)` and
 * threw — aborting the run after the theory stage. Honoring the real
 * `persistOutput` contract here exercises the same data flow
 * production does.
 */
async function defaultJobOk(
  args: { kind: string; persistOutput?: (data: unknown) => Promise<void> },
): Promise<{ ok: true }> {
  if (args?.persistOutput) {
    if (args.kind === 'topic-theory') {
      await args.persistOutput(FIXTURE_THEORY_DATA);
    } else if (args.kind === 'topic-study-cards') {
      await args.persistOutput([]);
    } else if (
      args.kind === 'topic-mini-game-category-sort' ||
      args.kind === 'topic-mini-game-sequence-build' ||
      args.kind === 'topic-mini-game-connection-web'
    ) {
      await args.persistOutput(stubMiniCardsForJobKind(args.kind));
    } else if (args.kind === 'topic-mini-games') {
      await args.persistOutput([]);
    }
  }
  return { ok: true };
}

function makeDeckRepository(overrides: Partial<IDeckRepository> = {}): IDeckRepository {
  return {
    getSubjectGraph: vi.fn(async () => graph),
    getTopicDetails: vi.fn(async () => null),
    getTopicCards: vi.fn(async () => []),
    getManifest: vi.fn(async () => ({
      subjects: [
        {
          id: 'sub-1',
          name: 'Subject',
          description: '',
          color: '#000',
          geometry: { gridTile: 'box' },
          metadata: {},
        },
      ],
    })),
    ...overrides,
  } as unknown as IDeckRepository;
}

function makeWriter(): IDeckContentWriter {
  return {
    upsertTopicDetails: vi.fn(async () => undefined),
    upsertTopicCards: vi.fn(async () => undefined),
    appendTopicCards: vi.fn(async () => undefined),
  } as unknown as IDeckContentWriter;
}

function resetStore() {
  // ContentGenerationState shape: { jobs, pipelines, abortControllers,
  // pipelineAbortControllers }. There is no `pipelineOrder` / `jobOrder`.
  useContentGenerationStore.setState({
    jobs: {},
    pipelines: {},
    abortControllers: {},
    pipelineAbortControllers: {},
    sessionFailureAttentionKeys: {},
    sessionRetryRoutingFailures: {},
  });
}

function logCalls() {
  return telemetryApi.log.mock.calls as Array<[string, Record<string, unknown>, Record<string, unknown>?]>;
}
function logTypes() {
  return logCalls().map((c) => c[0]);
}
function firstCallOfType(type: string) {
  return logCalls().find((c) => c[0] === type);
}

describe('runTopicGenerationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telemetryApi.log.mockReset();
    // `vi.clearAllMocks()` clears call history but NOT the queued
    // implementations of mockResolvedValueOnce / mockImplementationOnce.
    // We therefore reset the implementation explicitly each test to
    // prevent any leftover queue from bleeding into the next case.
    runContentGenerationJob.mockReset();
    resetStore();
  });

  it('runs the full pipeline by default and marks topic-unlock celebration on success', async () => {
    runContentGenerationJob.mockImplementation(defaultJobOk);
    const writer = makeWriter();

    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer,
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
      forceRegenerate: true,
    });

    expect(result.ok).toBe(true);
    expect(runContentGenerationJob).toHaveBeenCalledTimes(5);
    expect(celebrationApi.markPendingFromFullTopicUnlock).toHaveBeenCalledWith(
      topicRefKey({ subjectId: 'sub-1', topicId: 't-a' }),
    );
    const upsert = writer.upsertTopicDetails as ReturnType<typeof vi.fn>;
    const detailsArg = upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(detailsArg).toBeDefined();
    expect(detailsArg).not.toHaveProperty('miniGameAffordances');
  });

  it('passes JSON Schema responseFormatOverride for theory and per-type mini-game jobs; study cards omit override', async () => {
    runContentGenerationJob.mockImplementation(defaultJobOk);
    const writer = makeWriter();

    await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer,
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
      forceRegenerate: true,
    });

    const theoryArgs = runContentGenerationJob.mock.calls.map((c) => c[0] as { kind: string }).find(
      (a) => a.kind === 'topic-theory',
    );
    expect(theoryArgs).toMatchObject({
      responseFormatOverride: topicTheoryStructuredOutputResponseFormat,
    });

    const studyArgs = runContentGenerationJob.mock.calls
      .map((c) => c[0] as { kind: string; responseFormatOverride?: unknown })
      .find((a) => a.kind === 'topic-study-cards');
    expect(studyArgs).toBeDefined();
    expect(studyArgs).not.toHaveProperty('responseFormatOverride');

    const miniJobs: Array<{ kind: string; gameType: MiniGameType }> = [
      { kind: 'topic-mini-game-category-sort', gameType: 'CATEGORY_SORT' },
      { kind: 'topic-mini-game-sequence-build', gameType: 'SEQUENCE_BUILD' },
      { kind: 'topic-mini-game-connection-web', gameType: 'CONNECTION_WEB' },
    ];

    for (const { kind, gameType } of miniJobs) {
      const args = runContentGenerationJob.mock.calls
        .map((c) => c[0] as { kind: string; responseFormatOverride?: unknown })
        .find((a) => a.kind === kind);
      expect(args, kind).toBeDefined();
      expect(args!.responseFormatOverride).toEqual(buildTopicMiniGameCardsResponseFormat(gameType));
    }

    const knownKinds = new Set([
      'topic-theory',
      'topic-study-cards',
      ...miniJobs.map((m) => m.kind),
    ]);
    const otherJobs = runContentGenerationJob.mock.calls
      .map((c) => c[0] as { kind: string })
      .filter((a) => !knownKinds.has(a.kind));
    expect(otherJobs.length).toBe(0);
  });

  it('auto-skips when ready content already exists', async () => {
    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository({
        getTopicDetails: vi.fn(async () => readyDetails) as unknown as IDeckRepository['getTopicDetails'],
        getTopicCards: vi.fn(async () => readyCards) as unknown as IDeckRepository['getTopicCards'],
      }),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
    });

    expect(result).toEqual({ ok: true, pipelineId: '', skipped: true });
    expect(runContentGenerationJob).not.toHaveBeenCalled();
    expect(celebrationApi.markPendingFromFullTopicUnlock).not.toHaveBeenCalled();
  });

  it('returns ok:false when the topic is missing from the graph', async () => {
    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 'missing',
      enableReasoning: false,
    });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain('missing');
  });

  describe('telemetry emissions', () => {
    it('emits the canonical lifecycle order for a successful full pipeline', async () => {
      runContentGenerationJob.mockImplementation(defaultJobOk);

      await runTopicGenerationPipeline({
        chat: {} as IChatCompletionsRepository,
        deckRepository: makeDeckRepository(),
        writer: makeWriter(),
        subjectId: 'sub-1',
        topicId: 't-a',
        enableReasoning: false,
        stage: 'full',
        forceRegenerate: true,
      });

      expect(logTypes()).toEqual([
        'topic-content:generation-started',
        'topic-content:stage-started',
        'topic-content:stage-completed',
        'topic-content:stage-started',
        'topic-content:stage-completed',
        'topic-content:stage-started',
        'topic-content:stage-completed',
        'topic-content:generation-completed',
      ]);

      const stageStartedNames = logCalls()
        .filter((c) => c[0] === 'topic-content:stage-started')
        .map((c) => (c[1] as { stage: string }).stage);
      expect(stageStartedNames).toEqual(['theory', 'study-cards', 'mini-games']);

      const finalCall = firstCallOfType('topic-content:generation-completed');
      expect(finalCall).toBeDefined();
      const finalPayload = finalCall![1] as { ok: boolean; stage: string; error?: string };
      expect(finalPayload.ok).toBe(true);
      expect(finalPayload.stage).toBe('full');
      expect(finalPayload.error).toBeUndefined();

      const startedPayload = firstCallOfType('topic-content:generation-started')![1] as {
        forceRegenerate: boolean;
        resumeFromStage?: string;
        stage: string;
      };
      expect(startedPayload.forceRegenerate).toBe(true);
      expect(startedPayload.resumeFromStage).toBeUndefined();
      expect(startedPayload.stage).toBe('full');
    });

    it('emits stage-failed with the raw job error and stops the pipeline', async () => {
      // Counter-based impl avoids `mockResolvedValueOnce` queue leakage:
      // an unconsumed Once entry from a failing test would otherwise be
      // dequeued by the next test's first call to the mock, masking real
      // failures in unrelated tests. `mockReset()` in `beforeEach`
      // clears any prior implementation; the counter is local to this
      // closure.
      let calls = 0;
      runContentGenerationJob.mockImplementation(async (args: {
        kind: string;
        persistOutput?: (data: unknown) => Promise<void>;
      }) => {
        calls += 1;
        if (calls === 1) return defaultJobOk(args);
        return { ok: false, error: 'study cards LLM 503' };
      });

      const result = await runTopicGenerationPipeline({
        chat: {} as IChatCompletionsRepository,
        deckRepository: makeDeckRepository(),
        writer: makeWriter(),
        subjectId: 'sub-1',
        topicId: 't-a',
        enableReasoning: false,
        stage: 'full',
        forceRegenerate: true,
      });

      expect(result.ok).toBe(false);

      // mini-games stage-started must NOT appear (study-cards failure short-circuits)
      const stageStartedNames = logCalls()
        .filter((c) => c[0] === 'topic-content:stage-started')
        .map((c) => (c[1] as { stage: string }).stage);
      expect(stageStartedNames).toEqual(['theory', 'study-cards']);

      const failedCall = firstCallOfType('topic-content:stage-failed');
      expect(failedCall).toBeDefined();
      const failedPayload = failedCall![1] as { stage: string; error: string; durationMs: number };
      expect(failedPayload.stage).toBe('study-cards');
      // Raw error forwarded verbatim — no heuristic parsing.
      expect(failedPayload.error).toBe('study cards LLM 503');
      expect(failedPayload.durationMs).toBeGreaterThanOrEqual(0);

      const finalPayload = firstCallOfType('topic-content:generation-completed')![1] as {
        ok: boolean;
        error?: string;
      };
      expect(finalPayload.ok).toBe(false);
      expect(finalPayload.error).toBe('study cards LLM 503');

      // Celebration must NOT fire on failure.
      expect(celebrationApi.markPendingFromFullTopicUnlock).not.toHaveBeenCalled();
    });

    it('emits no telemetry on auto-skip', async () => {
      const result = await runTopicGenerationPipeline({
        chat: {} as IChatCompletionsRepository,
        deckRepository: makeDeckRepository({
          getTopicDetails: vi.fn(async () => readyDetails) as unknown as IDeckRepository['getTopicDetails'],
          getTopicCards: vi.fn(async () => readyCards) as unknown as IDeckRepository['getTopicCards'],
        }),
        writer: makeWriter(),
        subjectId: 'sub-1',
        topicId: 't-a',
        enableReasoning: false,
        stage: 'full',
      });

      expect(result.skipped).toBe(true);
      expect(telemetryApi.log).not.toHaveBeenCalled();
    });

    it('emits no telemetry when the topic is missing from the graph', async () => {
      await runTopicGenerationPipeline({
        chat: {} as IChatCompletionsRepository,
        deckRepository: makeDeckRepository(),
        writer: makeWriter(),
        subjectId: 'sub-1',
        topicId: 'missing-topic',
        enableReasoning: false,
      });
      expect(telemetryApi.log).not.toHaveBeenCalled();
    });

    it('emits only the stages actually executed when resumeFromStage is set', async () => {
      runContentGenerationJob.mockImplementation(defaultJobOk);

      await runTopicGenerationPipeline({
        chat: {} as IChatCompletionsRepository,
        deckRepository: makeDeckRepository({
          // Provide ready details so resume can resolveTheoryData() from the DB.
          getTopicDetails: vi.fn(async () => readyDetails) as unknown as IDeckRepository['getTopicDetails'],
        }),
        writer: makeWriter(),
        subjectId: 'sub-1',
        topicId: 't-a',
        enableReasoning: false,
        stage: 'full',
        resumeFromStage: 'mini-games',
        forceRegenerate: true,
      });

      const stageStartedNames = logCalls()
        .filter((c) => c[0] === 'topic-content:stage-started')
        .map((c) => (c[1] as { stage: string }).stage);
      expect(stageStartedNames).toEqual(['mini-games']);

      const startedPayload = firstCallOfType('topic-content:generation-started')![1] as {
        resumeFromStage?: string;
      };
      expect(startedPayload.resumeFromStage).toBe('mini-games');
    });

    it('emits stage-completed durationMs as a non-negative number', async () => {
      runContentGenerationJob.mockImplementation(defaultJobOk);

      await runTopicGenerationPipeline({
        chat: {} as IChatCompletionsRepository,
        deckRepository: makeDeckRepository(),
        writer: makeWriter(),
        subjectId: 'sub-1',
        topicId: 't-a',
        enableReasoning: false,
        stage: 'theory',
        forceRegenerate: true,
      });

      const stageCompletedPayload = firstCallOfType('topic-content:stage-completed')![1] as {
        durationMs: number;
        stage: string;
      };
      expect(stageCompletedPayload.stage).toBe('theory');
      expect(typeof stageCompletedPayload.durationMs).toBe('number');
      expect(stageCompletedPayload.durationMs).toBeGreaterThanOrEqual(0);

      const finalPayload = firstCallOfType('topic-content:generation-completed')![1] as {
        durationMs: number;
        stage: string;
        ok: boolean;
      };
      expect(finalPayload.stage).toBe('theory');
      expect(finalPayload.ok).toBe(true);
      expect(typeof finalPayload.durationMs).toBe('number');
      expect(finalPayload.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Phase B: terminal lifecycle event emission ───────────────────
  // Each test uses a fresh spy with mockRestore() so emission state never
  // bleeds across cases.

  it('emits topic-content:generation-completed when full pipeline succeeds', async () => {
    runContentGenerationJob.mockImplementation(defaultJobOk);
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
      forceRegenerate: true,
    });

    expect(emitSpy).toHaveBeenCalledWith(
      'topic-content:generation-completed',
      expect.objectContaining({
        subjectId: 'sub-1',
        topicId: 't-a',
        topicLabel: 'Topic A',
        stage: 'full',
      }),
    );
    emitSpy.mockRestore();
  });

  it('emits topic-content:generation-failed when a stage fails (carries errorMessage)', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: false, error: 'theory boom', jobId: 'theory-fail-1' });
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
      forceRegenerate: true,
    });

    expect(emitSpy).toHaveBeenCalledWith(
      'topic-content:generation-failed',
      expect.objectContaining({
        subjectId: 'sub-1',
        topicId: 't-a',
        topicLabel: 'Topic A',
        stage: 'full',
        errorMessage: 'theory boom',
        partialCompletion: {
          theory: 'failed',
          studyCards: 'skipped',
          miniGames: 'skipped',
        },
        jobId: 'theory-fail-1',
        failureKey: failureKeyForJob('theory-fail-1'),
      }),
    );
    emitSpy.mockRestore();
  });

  it('full pipeline: mini-game failure after theory and study reports partialCompletion and skips merged mini append', async () => {
    runContentGenerationJob.mockImplementation(
      async (args: { kind: string; persistOutput?: (d: unknown) => Promise<void> }) => {
        if (args.kind === 'topic-theory' || args.kind === 'topic-study-cards') {
          return defaultJobOk(args);
        }
        if (args.kind === 'topic-mini-game-category-sort') {
          return { ok: false, error: 'mini boom', jobId: 'mini-fail-1' };
        }
        return defaultJobOk(args);
      },
    );
    const writer = makeWriter();
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer,
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
      forceRegenerate: true,
    });

    expect(result.ok).toBe(false);
    expect((writer.upsertTopicDetails as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect((writer.upsertTopicCards as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect((writer.appendTopicCards as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();

    expect(emitSpy).toHaveBeenCalledWith(
      'topic-content:generation-failed',
      expect.objectContaining({
        partialCompletion: {
          theory: 'completed',
          studyCards: 'completed',
          miniGames: 'failed',
        },
        jobId: 'mini-fail-1',
        failureKey: failureKeyForJob('mini-fail-1'),
      }),
    );

    const terminalTelemetry = logCalls().filter((c) => c[0] === 'topic-content:generation-completed');
    const last = terminalTelemetry[terminalTelemetry.length - 1]?.[1] as Record<string, unknown> | undefined;
    expect(last?.ok).toBe(false);
    expect(last?.partialCompletion).toEqual({
      theory: 'completed',
      studyCards: 'completed',
      miniGames: 'failed',
    });

    emitSpy.mockRestore();
  });

  it('does not emit a terminal event when the run is auto-skipped', async () => {
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository({
        getTopicDetails: vi.fn(async () => readyDetails) as unknown as IDeckRepository['getTopicDetails'],
        getTopicCards: vi.fn(async () => readyCards) as unknown as IDeckRepository['getTopicCards'],
      }),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
    });

    expect(emitSpy).not.toHaveBeenCalledWith(
      'topic-content:generation-completed',
      expect.anything(),
    );
    expect(emitSpy).not.toHaveBeenCalledWith(
      'topic-content:generation-failed',
      expect.anything(),
    );
    emitSpy.mockRestore();
  });

  it('emits failure with topicLabel = topicId when topic not found in graph', async () => {
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 'missing-topic',
      enableReasoning: false,
    });

    expect(emitSpy).toHaveBeenCalledWith(
      'topic-content:generation-failed',
      expect.objectContaining({
        topicId: 'missing-topic',
        topicLabel: 'missing-topic',
        errorMessage: expect.stringContaining('not found'),
      }),
    );
    emitSpy.mockRestore();
  });
});
