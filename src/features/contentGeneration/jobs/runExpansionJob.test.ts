import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { surfaceProvidersApi } = vi.hoisted(() => ({
  surfaceProvidersApi: {
    resolveModelForSurface: vi.fn(() => 'test-model'),
    resolveEnableStreamingForSurface: vi.fn(() => true),
    resolveEnableReasoningForSurface: vi.fn(() => true),
  },
}));

vi.mock('@/infrastructure/llmInferenceSurfaceProviders', () => ({
  resolveModelForSurface: surfaceProvidersApi.resolveModelForSurface,
  resolveEnableStreamingForSurface: surfaceProvidersApi.resolveEnableStreamingForSurface,
  resolveEnableReasoningForSurface: surfaceProvidersApi.resolveEnableReasoningForSurface,
}));

vi.mock('@/infrastructure/repositories/contentGenerationLogRepository', () => ({
  persistTerminalJob: vi.fn().mockResolvedValue(undefined),
  persistPipeline: vi.fn().mockResolvedValue(undefined),
  clearPersistedLogs: vi.fn().mockResolvedValue(undefined),
  loadPersistedLogs: vi.fn().mockResolvedValue({ jobs: [], pipelines: [] }),
}));

const runContentGenerationJob = vi.fn();
vi.mock('../runContentGenerationJob', () => ({
  runContentGenerationJob: (...args: unknown[]) => runContentGenerationJob(...args),
}));

import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';
import type { Card, SubjectGraph, TopicDetails } from '@/types/core';

import { appEventBus } from '@/infrastructure/eventBus';
import { runExpansionJob } from './runExpansionJob';

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
      iconName: 'lightbulb',
    },
  ],
};

const detailsWithBuckets: TopicDetails = {
  topicId: 't-a',
  title: 'Topic A',
  subjectId: 'sub-1',
  coreConcept: 'c',
  theory: 'theory body',
  keyTakeaways: ['a'],
  coreQuestionsByDifficulty: { 1: ['q1'], 2: ['q2-a', 'q2-b'], 3: ['q3'], 4: ['q4'] },
  groundingSources: [],
};

const detailsMissingBucket2: TopicDetails = {
  ...detailsWithBuckets,
  coreQuestionsByDifficulty: { 1: ['q1'], 2: [], 3: ['q3'], 4: ['q4'] },
};

function makeRepo(details: TopicDetails = detailsWithBuckets): IDeckRepository {
  return {
    getManifest: vi.fn().mockResolvedValue({
      subjects: [
        { id: 'sub-1', name: 'S', description: '', color: '#000', geometry: { gridTile: 'box' } },
      ],
    }),
    getSubjectGraph: vi.fn().mockResolvedValue(graph),
    getTopicDetails: vi.fn().mockResolvedValue(details),
    getTopicCards: vi.fn().mockResolvedValue([] as Card[]),
  } as unknown as IDeckRepository;
}

function makeWriter(): IDeckContentWriter {
  return {
    upsertTopicDetails: vi.fn(),
    upsertTopicCards: vi.fn(),
    appendTopicCards: vi.fn(),
  } as unknown as IDeckContentWriter;
}

let emitSpy: ReturnType<typeof vi.spyOn>;

describe('runExpansionJob', () => {
  beforeEach(() => {
    runContentGenerationJob.mockReset();
    emitSpy = vi.spyOn(appEventBus, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  it('skips with no terminal emission when nextLevel is out of range', async () => {
    const result = await runExpansionJob({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeRepo(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      nextLevel: 0,
    });

    expect(result).toEqual({ ok: true, skipped: true });
    expect(runContentGenerationJob).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('emits topic-expansion:generation-failed when the syllabus bucket is empty', async () => {
    const result = await runExpansionJob({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeRepo(detailsMissingBucket2),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      nextLevel: 1,
    });

    expect(result.ok).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith(
      'topic-expansion:generation-failed',
      expect.objectContaining({
        subjectId: 'sub-1',
        topicId: 't-a',
        topicLabel: 'Topic A',
        level: 1,
        errorMessage: expect.stringContaining('No syllabus questions'),
      }),
    );
    expect(runContentGenerationJob).not.toHaveBeenCalled();
  });

  it('emits topic-expansion:generation-completed on success', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: true, jobId: 'j-1' });

    const result = await runExpansionJob({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeRepo(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      nextLevel: 1,
    });

    expect(result.ok).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith(
      'topic-expansion:generation-completed',
      expect.objectContaining({
        subjectId: 'sub-1',
        topicId: 't-a',
        topicLabel: 'Topic A',
        level: 1,
      }),
    );
  });

  it('emits topic-expansion:generation-failed when the underlying job fails', async () => {
    runContentGenerationJob.mockResolvedValue({ ok: false, jobId: 'j-1', error: 'expansion boom' });

    const result = await runExpansionJob({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeRepo(),
      writer: makeWriter(),
      subjectId: 'sub-1',
      topicId: 't-a',
      nextLevel: 1,
    });

    expect(result.ok).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith(
      'topic-expansion:generation-failed',
      expect.objectContaining({
        subjectId: 'sub-1',
        topicId: 't-a',
        topicLabel: 'Topic A',
        level: 1,
        errorMessage: 'expansion boom',
      }),
    );
  });
});
