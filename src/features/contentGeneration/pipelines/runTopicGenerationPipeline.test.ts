import { beforeEach, describe, expect, it, vi } from 'vitest';

const { surfaceProvidersApi } = vi.hoisted(() => ({
  surfaceProvidersApi: {
    resolveModelForSurface: vi.fn(() => 'test-model'),
    resolveEnableStreamingForSurface: vi.fn(() => true),
    resolveEnableReasoningForSurface: vi.fn(() => true),
  },
}));

const { celebrationApi } = vi.hoisted(() => ({
  celebrationApi: {
    markPendingFromFullTopicUnlock: vi.fn(),
    dismissPending: vi.fn(),
  },
}));

vi.mock('@/store/crystalContentCelebrationStore', () => ({
  useCrystalContentCelebrationStore: {
    getState: () => celebrationApi,
  },
}));

import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';
import type { Card, SubjectGraph, TopicDetails } from '@/types/core';

import { useContentGenerationStore } from '../contentGenerationStore';
import { runTopicGenerationPipeline } from './runTopicGenerationPipeline';

const runContentGenerationJob = vi.fn();

vi.mock('../runContentGenerationJob', () => ({
  runContentGenerationJob: (...args: unknown[]) => runContentGenerationJob(...args),
}));

vi.mock('@/infrastructure/repositories/contentGenerationLogRepository', () => ({
  persistTerminalJob: vi.fn().mockResolvedValue(undefined),
  persistPipeline: vi.fn().mockResolvedValue(undefined),
  clearPersistedLogs: vi.fn().mockResolvedValue(undefined),
  loadPersistedLogs: vi.fn().mockResolvedValue({ jobs: [], pipelines: [] }),
}));

vi.mock('@/infrastructure/llmInferenceSurfaceProviders', () => ({
  resolveModelForSurface: surfaceProvidersApi.resolveModelForSurface,
  resolveEnableStreamingForSurface: surfaceProvidersApi.resolveEnableStreamingForSurface,
  resolveEnableReasoningForSurface: surfaceProvidersApi.resolveEnableReasoningForSurface,
}));

function resetStore(): void {
  useContentGenerationStore.setState({
    jobs: {},
    pipelines: {},
    abortControllers: {},
    pipelineAbortControllers: {},
  });
}

const graph: SubjectGraph = {
  subjectId: 'sub-1',
  title: 'G',
  themeId: 'th',
  maxTier: 1,
  nodes: [
    {
      topicId: 't-a',
      title: 'Topic A',
      tier: 1,
      prerequisites: [],
      learningObjective: 'learn',
    },
  ],
};

const readyDetails: TopicDetails = {
  topicId: 't-a',
  title: 'Topic A',
  subjectId: 'sub-1',
  coreConcept: 'c',
  theory: 'non-empty theory',
  keyTakeaways: ['a', 'b', 'c', 'd'],
  coreQuestionsByDifficulty: { 1: ['q1'], 2: ['q2'], 3: ['q3'], 4: ['q4'] },
  groundingSources: [
    {
      title: 'Source',
      url: 'https://example.edu/source',
      retrievedAt: '2026-04-26T00:00:00.000Z',
      trustLevel: 'high',
    },
  ],
  miniGameAffordances: {
    categorySets: [],
    orderedSequences: [],
    connectionPairs: [],
  },
};

const readyCards: Card[] = [
  {
    id: 'c1',
    type: 'FLASHCARD',
    difficulty: 1,
    content: { front: 'f', back: 'b' },
  },
];

function makeDeckRepository(
  overrides?: Partial<Pick<IDeckRepository, 'getManifest' | 'getSubjectGraph' | 'getTopicDetails' | 'getTopicCards'>>,
) {
  return {
    getManifest: vi.fn().mockResolvedValue({
      subjects: [{ id: 'sub-1', name: 'S', description: '', color: '#000', geometry: { gridTile: 'box' } }],
    }),
    getSubjectGraph: vi.fn().mockResolvedValue(graph),
    getTopicDetails: vi.fn().mockResolvedValue(readyDetails),
    getTopicCards: vi.fn().mockResolvedValue(readyCards),
    ...overrides,
  } as unknown as IDeckRepository;
}

function makeWriter() {
  return {
    upsertTopicDetails: vi.fn(),
    upsertTopicCards: vi.fn(),
    appendTopicCards: vi.fn(),
  } as unknown as IDeckContentWriter;
}

describe('runTopicGenerationPipeline', () => {
  beforeEach(() => {
    resetStore();
    runContentGenerationJob.mockReset();
    celebrationApi.markPendingFromFullTopicUnlock.mockReset();
    celebrationApi.dismissPending.mockReset();
    surfaceProvidersApi.resolveEnableReasoningForSurface.mockReset();
    surfaceProvidersApi.resolveEnableReasoningForSurface.mockReturnValue(true);
  });

  it('marks celebration pending when full pipeline completes successfully', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: true });

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

    expect(result.ok).toBe(true);
    expect(celebrationApi.markPendingFromFullTopicUnlock).toHaveBeenCalledWith('sub-1::t-a');
  });

  it('does not mark celebration pending for standalone mini-games stage success', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: true });

    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'mini-games',
      forceRegenerate: true,
    });

    expect(result.ok).toBe(true);
    expect(celebrationApi.markPendingFromFullTopicUnlock).not.toHaveBeenCalled();
  });

  it('returns skipped without registering a pipeline or running jobs when study content is already ready', async () => {
    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
    });

    expect(result).toEqual({ ok: true, pipelineId: '', skipped: true });
    expect(runContentGenerationJob).not.toHaveBeenCalled();
    expect(celebrationApi.markPendingFromFullTopicUnlock).not.toHaveBeenCalled();
  });

  it('runs theory stage when study-ready (auto-skip applies only to full pipeline)', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: true });

    await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'theory',
    });

    expect(runContentGenerationJob).toHaveBeenCalledTimes(1);
    expect(runContentGenerationJob.mock.calls[0]?.[0]?.kind).toBe('topic-theory');
  });

  it('defaults topic generation reasoning from the surface config when omitted', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: true });

    await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      stage: 'theory',
      forceRegenerate: true,
    });

    expect(surfaceProvidersApi.resolveEnableReasoningForSurface).toHaveBeenCalledWith('topicContent');
    expect(runContentGenerationJob.mock.calls[0]?.[0]?.enableReasoning).toBe(true);
  });

  it('returns error when topic id is missing from graph without running jobs', async () => {
    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 'missing-topic',
      enableReasoning: false,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
    expect(runContentGenerationJob).not.toHaveBeenCalled();
  });

  // ── resumeFromStage tests ────────────────────────────────────────────────

  it('does not auto-skip when resumeFromStage is set even if content is ready', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: true });

    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
      resumeFromStage: 'study-cards',
      forceRegenerate: true,
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBeUndefined();
    // Theory (index 0) should be skipped, study-cards (1) and mini-games (2) should run
    expect(runContentGenerationJob).toHaveBeenCalledTimes(2);
    const kinds = runContentGenerationJob.mock.calls.map((c: unknown[]) => (c[0] as { kind: string }).kind);
    expect(kinds).toEqual(['topic-study-cards', 'topic-mini-games']);
  });

  it('resumes from mini-games, skipping theory and study-cards', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: true });

    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
      resumeFromStage: 'mini-games',
      forceRegenerate: true,
    });

    expect(result.ok).toBe(true);
    expect(runContentGenerationJob).toHaveBeenCalledTimes(1);
    expect(runContentGenerationJob.mock.calls[0]?.[0]?.kind).toBe('topic-mini-games');
  });

  it('resumes from theory runs all 3 stages (same as no resume)', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: true });

    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
      resumeFromStage: 'theory',
      forceRegenerate: true,
    });

    expect(result.ok).toBe(true);
    expect(runContentGenerationJob).toHaveBeenCalledTimes(3);
    const kinds = runContentGenerationJob.mock.calls.map((c: unknown[]) => (c[0] as { kind: string }).kind);
    expect(kinds).toEqual(['topic-theory', 'topic-study-cards', 'topic-mini-games']);
  });

  it('passes retryOf to pipeline registration', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: true });

    await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
      resumeFromStage: 'study-cards',
      forceRegenerate: true,
      retryOf: 'original-pipeline-id',
    });

    const pipelines = Object.values(useContentGenerationStore.getState().pipelines);
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0]!.retryOf).toBe('original-pipeline-id');
    expect(pipelines[0]!.label).toContain('Retry');
  });

  it('fails with error when resuming from study-cards but theory not in DB', async () => {
    const emptyDetails: TopicDetails = {
      topicId: 't-a',
      title: 'Topic A',
      subjectId: 'sub-1',
      coreConcept: '',
      theory: '',
      keyTakeaways: [],
      coreQuestionsByDifficulty: { 1: [], 2: [], 3: [], 4: [] },
    };

    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeDeckRepository({ getTopicDetails: vi.fn().mockResolvedValue(emptyDetails) }),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      enableReasoning: false,
      stage: 'full',
      resumeFromStage: 'study-cards',
      forceRegenerate: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('theory not available');
    expect(runContentGenerationJob).not.toHaveBeenCalled();
  });
});
