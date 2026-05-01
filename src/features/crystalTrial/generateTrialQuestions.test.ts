import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { surfaceProvidersApi } = vi.hoisted(() => ({
  surfaceProvidersApi: {
    resolveModelForSurface: vi.fn(() => 'test-model'),
    resolveEnableStreamingForSurface: vi.fn(() => false),
    resolveEnableReasoningForSurface: vi.fn(() => false),
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

const mockRunContentGenerationJob = vi.fn();
vi.mock('@/features/contentGeneration/runContentGenerationJob', () => ({
  runContentGenerationJob: (...args: unknown[]) => mockRunContentGenerationJob(...args),
}));

import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckRepository } from '@/types/repository';
import type { Card, SubjectGraph } from '@/types/core';

import { appEventBus } from '@/infrastructure/eventBus';
import { useCrystalTrialStore } from './crystalTrialStore';
import { generateTrialQuestions } from './generateTrialQuestions';

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

const cardsAtL2: Card[] = [
  { id: 'c1', type: 'FLASHCARD', difficulty: 2, content: { front: 'f', back: 'b' } },
  { id: 'c2', type: 'FLASHCARD', difficulty: 2, content: { front: 'f', back: 'b' } },
  { id: 'c3', type: 'FLASHCARD', difficulty: 2, content: { front: 'f', back: 'b' } },
  { id: 'c4', type: 'FLASHCARD', difficulty: 2, content: { front: 'f', back: 'b' } },
];

function makeRepo(cards: Card[] = cardsAtL2): IDeckRepository {
  return {
    getManifest: vi.fn().mockResolvedValue({ subjects: [] }),
    getSubjectGraph: vi.fn().mockResolvedValue(graph),
    getTopicCards: vi.fn().mockResolvedValue(cards),
  } as unknown as IDeckRepository;
}

let emitSpy: ReturnType<typeof vi.spyOn>;

describe('generateTrialQuestions', () => {
  beforeEach(() => {
    mockRunContentGenerationJob.mockReset();
    useCrystalTrialStore.setState((s) => ({ ...s, trials: {} }));
    emitSpy = vi.spyOn(appEventBus, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  it('emits crystal-trial:generation-failed when no cards at target difficulty', async () => {
    const result = await generateTrialQuestions({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeRepo([]),
      subjectId: 'sub-1',
      topicId: 't-a',
      currentLevel: 1,
    });

    expect(result.ok).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith(
      'crystal-trial:generation-failed',
      expect.objectContaining({
        subjectId: 'sub-1',
        topicId: 't-a',
        topicLabel: 'Topic A',
        level: 2,
        errorMessage: expect.stringContaining('No cards at difficulty'),
      }),
    );
    expect(mockRunContentGenerationJob).not.toHaveBeenCalled();
  });

  it('emits crystal-trial:generation-failed when the LLM job fails', async () => {
    mockRunContentGenerationJob.mockResolvedValue({ ok: false, jobId: 'j-1', error: 'llm boom' });

    const result = await generateTrialQuestions({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeRepo(),
      subjectId: 'sub-1',
      topicId: 't-a',
      currentLevel: 1,
    });

    expect(result.ok).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith(
      'crystal-trial:generation-failed',
      expect.objectContaining({
        subjectId: 'sub-1',
        topicId: 't-a',
        topicLabel: 'Topic A',
        level: 2,
        errorMessage: 'llm boom',
      }),
    );
  });

  it('does not emit any failure event on successful generation', async () => {
    mockRunContentGenerationJob.mockResolvedValue({ ok: true, jobId: 'j-1' });

    const result = await generateTrialQuestions({
      chat: {} as IChatCompletionsRepository,
      deckRepository: makeRepo(),
      subjectId: 'sub-1',
      topicId: 't-a',
      currentLevel: 1,
    });

    expect(result.ok).toBe(true);
    expect(emitSpy).not.toHaveBeenCalledWith(
      'crystal-trial:generation-failed',
      expect.anything(),
    );
  });
});
