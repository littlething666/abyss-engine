import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentGenerationJob, ContentGenerationPipeline } from '@/types/contentGeneration';

import { appEventBus } from '@/infrastructure/eventBus';
import { useContentGenerationStore } from './contentGenerationStore';
import { canRetryJob, canRetryPipeline, retryFailedJob, retryFailedPipeline } from './retryContentGeneration';

const mockRetryRun = vi.fn().mockResolvedValue({ runId: 'retry-run-1' });

vi.mock('./generationClient', () => ({
  getGenerationClient: () => ({
    retry: mockRetryRun,
  }),
}));

vi.mock('@/infrastructure/repositories/contentGenerationLogRepository', () => ({
  persistTerminalJob: vi.fn().mockResolvedValue(undefined),
  persistPipeline: vi.fn().mockResolvedValue(undefined),
  clearPersistedLogs: vi.fn().mockResolvedValue(undefined),
  loadPersistedLogs: vi.fn().mockResolvedValue({ jobs: [], pipelines: [] }),
}));

function resetStore(): void {
  useContentGenerationStore.setState({
    jobs: {},
    pipelines: {},
    abortControllers: {},
    pipelineAbortControllers: {},
    sessionFailureAttentionKeys: {},
    sessionRetryRoutingFailures: {},
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
    metadata: null,
    ...overrides,
  };
}

describe('canRetryJob', () => {
  it('returns true for failed or aborted jobs with a subjectId', () => {
    expect(canRetryJob(makeJob({ status: 'failed' }))).toBe(true);
    expect(canRetryJob(makeJob({ status: 'aborted' }))).toBe(true);
  });

  it('returns false for completed jobs or jobs without a subjectId', () => {
    expect(canRetryJob(makeJob({ status: 'completed' }))).toBe(false);
    expect(canRetryJob(makeJob({ status: 'failed', subjectId: null }))).toBe(false);
  });
});

describe('canRetryPipeline', () => {
  it('returns true when a pipeline has a failed or aborted job', () => {
    const pipeline: ContentGenerationPipeline = { id: 'p1', label: 'P', createdAt: 0, retryOf: null };
    expect(canRetryPipeline(pipeline, [makeJob({ pipelineId: 'p1', status: 'failed' })])).toBe(true);
    expect(canRetryPipeline(pipeline, [makeJob({ pipelineId: 'p1', status: 'aborted' })])).toBe(true);
  });

  it('returns false when all jobs completed', () => {
    const pipeline: ContentGenerationPipeline = { id: 'p1', label: 'P', createdAt: 0, retryOf: null };
    expect(canRetryPipeline(pipeline, [makeJob({ pipelineId: 'p1', status: 'completed' })])).toBe(false);
  });
});

describe('retryFailedJob', () => {
  beforeEach(() => {
    resetStore();
    mockRetryRun.mockReset().mockResolvedValue({ runId: 'retry-run-1' });
  });

  it('calls the durable retry endpoint with the failed job and stage', async () => {
    await retryFailedJob(makeJob({ kind: 'topic-study-cards', pipelineId: 'run-123' }));

    expect(mockRetryRun).toHaveBeenCalledWith('run-123', {
      jobId: 'job-1',
      stage: 'study-cards',
    });
  });

  it('uses metadata.runId when durable projection stores it on the job', async () => {
    await retryFailedJob(makeJob({ metadata: { runId: 'run-from-metadata' } }));

    expect(mockRetryRun).toHaveBeenCalledWith('run-from-metadata', {
      jobId: 'job-1',
      stage: 'theory',
    });
  });

  it('falls back to the job id for standalone durable jobs', async () => {
    await retryFailedJob(makeJob({ kind: 'crystal-trial', pipelineId: null }));

    expect(mockRetryRun).toHaveBeenCalledWith('job-1', { jobId: 'job-1' });
  });

  it('does not retry a completed job', async () => {
    await retryFailedJob(makeJob({ status: 'completed' }));

    expect(mockRetryRun).not.toHaveBeenCalled();
  });
});

describe('retryFailedPipeline', () => {
  beforeEach(() => {
    resetStore();
    mockRetryRun.mockReset().mockResolvedValue({ runId: 'retry-run-1' });
  });

  it('retries a durable pipeline from the first failed stage', async () => {
    useContentGenerationStore.setState({
      jobs: {
        j1: makeJob({ id: 'j1', pipelineId: 'p1', kind: 'topic-theory', status: 'completed', createdAt: 1 }),
        j2: makeJob({ id: 'j2', pipelineId: 'p1', kind: 'topic-mini-games', status: 'failed', createdAt: 2 }),
      },
      pipelines: { p1: { id: 'p1', label: 'P', createdAt: 0, retryOf: null } },
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('p1');

    expect(mockRetryRun).toHaveBeenCalledWith('p1', {
      jobId: 'j2',
      stage: 'mini-games',
    });
  });

  it('does nothing when a pipeline has no retryable jobs', async () => {
    useContentGenerationStore.setState({
      jobs: { j1: makeJob({ id: 'j1', pipelineId: 'p1', status: 'completed' }) },
      pipelines: { p1: { id: 'p1', label: 'P', createdAt: 0, retryOf: null } },
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('p1');

    expect(mockRetryRun).not.toHaveBeenCalled();
  });
});

describe('content-generation:retry-failed terminal events', () => {
  beforeEach(() => {
    resetStore();
    mockRetryRun.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits when durable job retry fails', async () => {
    mockRetryRun.mockRejectedValueOnce(new Error('retry blew up'));
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    await retryFailedJob(makeJob({ id: 'job-error' }));

    expect(emitSpy).toHaveBeenCalledWith(
      'content-generation:retry-failed',
      expect.objectContaining({
        jobId: 'job-error',
        errorMessage: 'retry blew up',
      }),
    );
  });

  it('emits when durable pipeline retry fails', async () => {
    mockRetryRun.mockRejectedValueOnce(new Error('retry pipeline blew up'));
    const emitSpy = vi.spyOn(appEventBus, 'emit');
    useContentGenerationStore.setState({
      jobs: { j1: makeJob({ id: 'j1', pipelineId: 'p1', status: 'failed' }) },
      pipelines: { p1: { id: 'p1', label: 'Pipeline P1', createdAt: 0, retryOf: null } },
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('p1');

    expect(emitSpy).toHaveBeenCalledWith(
      'content-generation:retry-failed',
      expect.objectContaining({
        jobId: 'j1',
        errorMessage: 'retry pipeline blew up',
      }),
    );
  });
});
