import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  resolveModelForSurface: () => 'test-model',
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

describe('runTopicGenerationPipeline', () => {
  beforeEach(() => {
    resetStore();
    runContentGenerationJob.mockReset();
  });

  it('returns skipped without registering a pipeline or running jobs when study content is already ready', async () => {
    const details: TopicDetails = {
      topicId: 't-a',
      title: 'Topic A',
      subjectId: 'sub-1',
      coreConcept: 'c',
      theory: 'non-empty theory',
      keyTakeaways: [],
      coreQuestionsByDifficulty: { 1: ['q1'], 2: [], 3: [] },
    };
    const cards: Card[] = [
      {
        id: 'c1',
        type: 'FLASHCARD',
        difficulty: 1,
        content: { front: 'f', back: 'b' },
      },
    ];

    const deckRepository: Pick<IDeckRepository, 'getManifest' | 'getSubjectGraph' | 'getTopicDetails' | 'getTopicCards'> =
      {
        getManifest: vi.fn().mockResolvedValue({ subjects: [{ id: 'sub-1', name: 'S', description: '', color: '#000', geometry: { gridTile: 'box' } }] }),
        getSubjectGraph: vi.fn().mockResolvedValue(graph),
        getTopicDetails: vi.fn().mockResolvedValue(details),
        getTopicCards: vi.fn().mockResolvedValue(cards),
      };

    const writer: Pick<IDeckContentWriter, 'upsertTopicDetails' | 'upsertTopicCards' | 'appendTopicCards'> = {
      upsertTopicDetails: vi.fn(),
      upsertTopicCards: vi.fn(),
      appendTopicCards: vi.fn(),
    };

    const chat = {} as IChatCompletionsRepository;

    const result = await runTopicGenerationPipeline({
      chat,
      deckRepository: deckRepository as IDeckRepository,
      writer: writer as IDeckContentWriter,
      subjectId: 'sub-1',
      topicId: 't-a',
      enableThinking: false,
      stage: 'full',
    });

    expect(result).toEqual({ ok: true, pipelineId: '', skipped: true });
    expect(runContentGenerationJob).not.toHaveBeenCalled();
  });

  it('runs theory stage when study-ready (auto-skip applies only to full pipeline)', async () => {
    const details: TopicDetails = {
      topicId: 't-a',
      title: 'Topic A',
      subjectId: 'sub-1',
      coreConcept: 'c',
      theory: 'non-empty theory',
      keyTakeaways: ['a', 'b', 'c', 'd'],
      coreQuestionsByDifficulty: { 1: ['q1'], 2: ['q2'], 3: ['q3'] },
    };
    const cards: Card[] = [
      {
        id: 'c1',
        type: 'FLASHCARD',
        difficulty: 1,
        content: { front: 'f', back: 'b' },
      },
    ];

    runContentGenerationJob.mockResolvedValue({ ok: true });

    const deckRepository: Pick<IDeckRepository, 'getManifest' | 'getSubjectGraph' | 'getTopicDetails' | 'getTopicCards'> =
      {
        getManifest: vi.fn().mockResolvedValue({ subjects: [{ id: 'sub-1', name: 'S', description: '', color: '#000', geometry: { gridTile: 'box' } }] }),
        getSubjectGraph: vi.fn().mockResolvedValue(graph),
        getTopicDetails: vi.fn().mockResolvedValue(details),
        getTopicCards: vi.fn().mockResolvedValue(cards),
      };

    const writer: Pick<IDeckContentWriter, 'upsertTopicDetails' | 'upsertTopicCards' | 'appendTopicCards'> = {
      upsertTopicDetails: vi.fn(),
      upsertTopicCards: vi.fn(),
      appendTopicCards: vi.fn(),
    };

    await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: deckRepository as IDeckRepository,
      writer: writer as IDeckContentWriter,
      subjectId: 'sub-1',
      topicId: 't-a',
      enableThinking: false,
      stage: 'theory',
    });

    expect(runContentGenerationJob).toHaveBeenCalledTimes(1);
    expect(runContentGenerationJob.mock.calls[0]?.[0]?.kind).toBe('topic-theory');
  });

  it('returns error when topic id is missing from graph without running jobs', async () => {
    const deckRepository: Pick<IDeckRepository, 'getManifest' | 'getSubjectGraph' | 'getTopicDetails' | 'getTopicCards'> =
      {
        getManifest: vi.fn(),
        getSubjectGraph: vi.fn().mockResolvedValue(graph),
        getTopicDetails: vi.fn(),
        getTopicCards: vi.fn(),
      };

    const result = await runTopicGenerationPipeline({
      chat: {} as IChatCompletionsRepository,
      deckRepository: deckRepository as IDeckRepository,
      writer: {} as IDeckContentWriter,
      subjectId: 'sub-1',
      topicId: 'missing-topic',
      enableThinking: false,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
    expect(runContentGenerationJob).not.toHaveBeenCalled();
  });
});
