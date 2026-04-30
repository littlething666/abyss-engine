import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runTopicGenerationPipeline } from './runTopicGenerationPipeline';
import { useContentGenerationStore } from '../contentGenerationStore';
import { topicRefKey } from '@/lib/topicRef';
import type { IChatCompletionsRepository } from '@/types/llm';
import type {
  IDeckRepository,
  IDeckContentWriter,
} from '@/types/repository';

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

const graph = {
  subjectId: 'sub-1',
  title: 'Subject',
  nodes: [
    {
      topicId: 't-a',
      title: 'Topic A',
      learningObjective: 'objective',
      level: 1,
      prerequisiteTopicIds: [],
    },
  ],
  edges: [],
};

const readyDetails = {
  topicId: 't-a',
  title: 'Topic A',
  subjectId: 'sub-1',
  coreConcept: 'cc',
  theory: 'theory body',
  keyTakeaways: ['k1', 'k2', 'k3'],
  coreQuestionsByDifficulty: {
    1: ['q1', 'q2', 'q3'],
    2: ['q1', 'q2', 'q3'],
    3: ['q1', 'q2', 'q3'],
    4: ['q1', 'q2', 'q3'],
  },
  groundingSources: [],
  miniGameAffordances: [],
};

const readyCards = Array.from({ length: 6 }).map((_, i) => ({
  id: `c-${i}`,
  topicId: 't-a',
  difficulty: 1,
  kind: 'study' as const,
  prompt: 'p',
  answer: 'a',
}));

/**
 * Theory payload fixture used by the faithful `runContentGenerationJob`
 * mock when emulating the topic-theory stage. Mirrors the production
 * `ParsedTopicTheoryPayload` shape so `runTopicGenerationPipeline`'s
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
  miniGameAffordances: { categorySets: [], orderedSequences: [], connectionPairs: [] },
};

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
    } else if (args.kind === 'topic-study-cards' || args.kind === 'topic-mini-games') {
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
      subjects: [{ id: 'sub-1', name: 'Subject', metadata: {} }],
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
    expect(runContentGenerationJob).toHaveBeenCalledTimes(3);
    expect(celebrationApi.markPendingFromFullTopicUnlock).toHaveBeenCalledWith(
      topicRefKey({ subjectId: 'sub-1', topicId: 't-a' }),
    );
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
});
