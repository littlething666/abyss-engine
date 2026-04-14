import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentGenerationJob, ContentGenerationPipeline } from '@/types/contentGeneration';

import { useContentGenerationStore } from './contentGenerationStore';
import { canRetryJob, canRetryPipeline, retryFailedJob, retryFailedPipeline } from './retryContentGeneration';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRunTopicPipeline = vi.fn();
const mockRunExpansionJob = vi.fn();
const mockOrchExecute = vi.fn();
const mockGetManifest = vi.fn();

vi.mock('./pipelines/runTopicGenerationPipeline', () => ({
  runTopicGenerationPipeline: (...args: unknown[]) => mockRunTopicPipeline(...args),
}));

vi.mock('./jobs/runExpansionJob', () => ({
  runExpansionJob: (...args: unknown[]) => mockRunExpansionJob(...args),
}));

vi.mock('@/features/subjectGeneration', () => ({
  createSubjectGenerationOrchestrator: () => ({ execute: mockOrchExecute }),
}));

vi.mock('@/infrastructure/di', () => ({
  deckRepository: { getManifest: (...args: unknown[]) => mockGetManifest(...args) },
  deckWriter: {},
}));

vi.mock('@/infrastructure/llmInferenceRegistry', () => ({
  getChatCompletionsRepositoryForSurface: () => ({}),
}));

vi.mock('@/infrastructure/llmInferenceSurfaceProviders', () => ({
  resolveModelForSurface: () => 'test-model',
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

vi.mock('@/infrastructure/repositories/contentGenerationLogRepository', () => ({
  persistTerminalJob: vi.fn().mockResolvedValue(undefined),
  persistPipeline: vi.fn().mockResolvedValue(undefined),
  clearPersistedLogs: vi.fn().mockResolvedValue(undefined),
  loadPersistedLogs: vi.fn().mockResolvedValue({ jobs: [], pipelines: [] }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetStore(): void {
  useContentGenerationStore.setState({
    jobs: {},
    pipelines: {},
    abortControllers: {},
    pipelineAbortControllers: {},
  });
}

function makeJob(overrides: Partial<ContentGenerationJob>): ContentGenerationJob {
  return {
    id: 'job-1',
    pipelineId: null,
    kind: 'topic-theory',
    status: 'failed',
    label: 'Theory — Test',
    subjectId: 'sub-1',
    topicId: 'top-1',
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: Date.now(),
    inputMessages: null,
    rawOutput: '',
    reasoningText: null,
    error: 'some error',
    parseError: null,
    retryOf: null,
    metadata: { enableThinking: false },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('canRetryJob', () => {
  it('returns true for failed job with subjectId', () => {
    expect(canRetryJob(makeJob({ status: 'failed' }))).toBe(true);
  });

  it('returns true for aborted job with subjectId', () => {
    expect(canRetryJob(makeJob({ status: 'aborted' }))).toBe(true);
  });

  it('returns false for completed job', () => {
    expect(canRetryJob(makeJob({ status: 'completed' }))).toBe(false);
  });

  it('returns false for failed job without subjectId', () => {
    expect(canRetryJob(makeJob({ status: 'failed', subjectId: null }))).toBe(false);
  });
});

describe('canRetryPipeline', () => {
  it('returns true when pipeline has a failed job', () => {
    const pipeline: ContentGenerationPipeline = { id: 'p1', label: 'P', createdAt: 0, retryOf: null };
    const jobs = [makeJob({ pipelineId: 'p1', status: 'failed' })];
    expect(canRetryPipeline(pipeline, jobs)).toBe(true);
  });

  it('returns false when all jobs completed', () => {
    const pipeline: ContentGenerationPipeline = { id: 'p1', label: 'P', createdAt: 0, retryOf: null };
    const jobs = [makeJob({ pipelineId: 'p1', status: 'completed' })];
    expect(canRetryPipeline(pipeline, jobs)).toBe(false);
  });
});

describe('retryFailedJob', () => {
  beforeEach(() => {
    resetStore();
    mockRunTopicPipeline.mockReset();
    mockRunExpansionJob.mockReset();
    mockOrchExecute.mockReset();
    mockGetManifest.mockReset();
  });

  it('calls runTopicGenerationPipeline for topic-theory jobs', async () => {
    const job = makeJob({ kind: 'topic-theory', metadata: { enableThinking: true } });
    await retryFailedJob(job);

    expect(mockRunTopicPipeline).toHaveBeenCalledTimes(1);
    const params = mockRunTopicPipeline.mock.calls[0]?.[0];
    expect(params.stage).toBe('theory');
    expect(params.enableThinking).toBe(true);
    expect(params.retryOf).toBe('job-1');
    expect(params.forceRegenerate).toBe(true);
  });

  it('calls runTopicGenerationPipeline for topic-study-cards jobs', async () => {
    const job = makeJob({ kind: 'topic-study-cards' });
    await retryFailedJob(job);

    expect(mockRunTopicPipeline).toHaveBeenCalledTimes(1);
    expect(mockRunTopicPipeline.mock.calls[0]?.[0]?.stage).toBe('study-cards');
  });

  it('calls runTopicGenerationPipeline for topic-mini-games jobs', async () => {
    const job = makeJob({ kind: 'topic-mini-games' });
    await retryFailedJob(job);

    expect(mockRunTopicPipeline).toHaveBeenCalledTimes(1);
    expect(mockRunTopicPipeline.mock.calls[0]?.[0]?.stage).toBe('mini-games');
  });

  it('calls runExpansionJob with nextLevel from metadata', async () => {
    const job = makeJob({
      kind: 'topic-expansion-cards',
      label: 'Expansion L2 — Topic A',
      metadata: { enableThinking: false, nextLevel: 2 },
    });
    await retryFailedJob(job);

    expect(mockRunExpansionJob).toHaveBeenCalledTimes(1);
    const params = mockRunExpansionJob.mock.calls[0]?.[0];
    expect(params.nextLevel).toBe(2);
    expect(params.retryOf).toBe('job-1');
  });

  it('falls back to label parsing for expansion when metadata lacks nextLevel', async () => {
    const job = makeJob({
      kind: 'topic-expansion-cards',
      label: 'Expansion L3 — Topic B',
      metadata: { enableThinking: false },
    });
    await retryFailedJob(job);

    expect(mockRunExpansionJob).toHaveBeenCalledTimes(1);
    expect(mockRunExpansionJob.mock.calls[0]?.[0]?.nextLevel).toBe(3);
  });

  it('calls orchestrator.execute for subject-graph jobs', async () => {
    mockGetManifest.mockResolvedValue({
      subjects: [
        {
          id: 'sub-1',
          name: 'S',
          description: '',
          color: '#000',
          geometry: { gridTile: 'box' },
          metadata: { checklist: { topicName: 'Test' } },
        },
      ],
    });

    const job = makeJob({ kind: 'subject-graph', topicId: null });
    await retryFailedJob(job);

    expect(mockOrchExecute).toHaveBeenCalledTimes(1);
    const [req, deps] = mockOrchExecute.mock.calls[0] ?? [];
    expect(req.subjectId).toBe('sub-1');
    expect(deps.retryOf).toBe('job-1');
  });

  it('does not retry a completed job', async () => {
    const job = makeJob({ status: 'completed' });
    await retryFailedJob(job);

    expect(mockRunTopicPipeline).not.toHaveBeenCalled();
    expect(mockRunExpansionJob).not.toHaveBeenCalled();
    expect(mockOrchExecute).not.toHaveBeenCalled();
  });
});

describe('retryFailedPipeline', () => {
  beforeEach(() => {
    resetStore();
    mockRunTopicPipeline.mockReset();
    mockOrchExecute.mockReset();
    mockGetManifest.mockReset();
  });

  it('resumes topic pipeline from first failed stage', async () => {
    const completedJob = makeJob({
      id: 'j1',
      pipelineId: 'p1',
      kind: 'topic-theory',
      status: 'completed',
      createdAt: 1,
    });
    const failedJob = makeJob({
      id: 'j2',
      pipelineId: 'p1',
      kind: 'topic-study-cards',
      status: 'failed',
      createdAt: 2,
      metadata: { enableThinking: true },
    });

    useContentGenerationStore.setState({
      jobs: { j1: completedJob, j2: failedJob },
      pipelines: { p1: { id: 'p1', label: 'P', createdAt: 0, retryOf: null } },
      abortControllers: {},
      pipelineAbortControllers: {},
    });

    await retryFailedPipeline('p1');

    expect(mockRunTopicPipeline).toHaveBeenCalledTimes(1);
    const params = mockRunTopicPipeline.mock.calls[0]?.[0];
    expect(params.resumeFromStage).toBe('study-cards');
    expect(params.enableThinking).toBe(true);
    expect(params.retryOf).toBe('p1');
  });

  it('does nothing when no jobs exist for pipeline', async () => {
    useContentGenerationStore.setState({
      jobs: {},
      pipelines: {},
      abortControllers: {},
      pipelineAbortControllers: {},
    });

    await retryFailedPipeline('nonexistent');
    expect(mockRunTopicPipeline).not.toHaveBeenCalled();
  });
});
