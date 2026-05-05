import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentGenerationJob, ContentGenerationPipeline } from '@/types/contentGeneration';

import { appEventBus } from '@/infrastructure/eventBus';
import { useContentGenerationStore } from './contentGenerationStore';
import { canRetryJob, canRetryPipeline, retryFailedJob, retryFailedPipeline } from './retryContentGeneration';

const mockSubmitRun = vi.fn().mockResolvedValue({ runId: 'run-1' });
const mockPrepareTopicContentRunInput = vi.fn();
const mockPrepareCrystalTrialRunInput = vi.fn();
const mockPrepareTopicExpansionRunInput = vi.fn();
const mockPrepareSubjectGraphTopicsRunInput = vi.fn();

vi.mock('./generationClient', () => ({
  getGenerationClient: () => ({
    submitRun: mockSubmitRun,
  }),
}));

vi.mock('./prepareGenerationRunSubmit', () => ({
  prepareTopicContentRunInput: (...args: unknown[]) => mockPrepareTopicContentRunInput(...args),
  prepareCrystalTrialRunInput: (...args: unknown[]) => mockPrepareCrystalTrialRunInput(...args),
  prepareTopicExpansionRunInput: (...args: unknown[]) => mockPrepareTopicExpansionRunInput(...args),
  prepareSubjectGraphTopicsRunInput: (...args: unknown[]) => mockPrepareSubjectGraphTopicsRunInput(...args),
}));

const mockGetManifest = vi.fn();

vi.mock('@/infrastructure/di', () => ({
  deckRepository: { getManifest: (...args: unknown[]) => mockGetManifest(...args) },
  deckWriter: {},
}));

vi.mock('@/infrastructure/llmInferenceSurfaceProviders', () => ({
  resolveModelForSurface: (surface: string) => `model:${surface}`,
  resolveEnableReasoningForSurface: () => false,
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
    metadata: { enableReasoning: false },
    ...overrides,
  };
}

function stubTopicRunInput(): Record<string, unknown> {
  return {
    pipelineKind: 'topic-content',
    subjectId: 'sub-1',
    topicId: 'top-1',
    snapshot: { pipeline_kind: 'topic-theory' },
    topicContentLegacyOptions: {},
  };
}

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
    mockSubmitRun.mockClear();
    mockPrepareTopicContentRunInput.mockReset().mockResolvedValue(stubTopicRunInput());
    mockPrepareCrystalTrialRunInput.mockReset().mockResolvedValue({
      pipelineKind: 'crystal-trial',
      subjectId: 'sub-1',
      topicId: 'top-1',
      currentLevel: 0,
      snapshot: { pipeline_kind: 'crystal-trial' },
    });
    mockPrepareTopicExpansionRunInput.mockReset().mockResolvedValue({
      pipelineKind: 'topic-expansion',
      subjectId: 'sub-1',
      topicId: 'top-1',
      nextLevel: 2,
      snapshot: { pipeline_kind: 'topic-expansion-cards' },
    });
    mockPrepareSubjectGraphTopicsRunInput.mockReset().mockResolvedValue({
      pipelineKind: 'subject-graph',
      subjectId: 'sub-1',
      stage: 'topics',
      snapshot: { pipeline_kind: 'subject-graph-topics' },
    });
    mockGetManifest.mockReset();
  });

  it('submits topic-theory retries via GenerationClient', async () => {
    const job = makeJob({ kind: 'topic-theory', metadata: { enableReasoning: true } });
    await retryFailedJob(job);

    expect(mockPrepareTopicContentRunInput).toHaveBeenCalledTimes(1);
    const req = mockPrepareTopicContentRunInput.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(req.stage).toBe('theory');
    expect(req.enableReasoning).toBe(true);
    const rc = req.retryContext as { pipelineRetryOf: unknown; jobRetryOfByStage: Record<string, string> };
    expect(rc.pipelineRetryOf).toBeNull();
    expect(rc.jobRetryOfByStage.theory).toBe('job-1');
    expect(req.forceRegenerate).toBe(true);

    expect(mockSubmitRun).toHaveBeenCalledTimes(1);
    expect(mockSubmitRun.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^retry:job:job-1:/) }),
    );
  });

  it('submits topic-study-cards retries', async () => {
    const job = makeJob({ kind: 'topic-study-cards' });
    await retryFailedJob(job);

    expect(mockPrepareTopicContentRunInput.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ stage: 'study-cards' }),
    );
  });

  it('submits per-type mini-game retries with override', async () => {
    const job = makeJob({ id: 'mg-1', kind: 'topic-mini-game-category-sort' });
    await retryFailedJob(job);

    const req = mockPrepareTopicContentRunInput.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(req.stage).toBe('mini-games');
    expect(req.miniGameKindsOverride).toEqual(['CATEGORY_SORT']);
    const rc = req.retryContext as { jobRetryOfByStage: Record<string, string> };
    expect(rc.jobRetryOfByStage['mini-games']).toBe('mg-1');
  });

  it('submits topic-mini-games retries', async () => {
    const job = makeJob({ kind: 'topic-mini-games' });
    await retryFailedJob(job);

    expect(mockPrepareTopicContentRunInput.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ stage: 'mini-games', miniGameKindsOverride: undefined }),
    );
  });

  it('submits crystal-trial retries with retryOf metadata', async () => {
    const job = makeJob({
      kind: 'crystal-trial',
      label: 'Crystal Trial L3 — Topic A',
      metadata: { enableReasoning: true, currentLevel: 2 },
    });

    await retryFailedJob(job);

    expect(mockPrepareCrystalTrialRunInput).toHaveBeenCalledWith(
      expect.anything(),
      'model:crystalTrial',
      expect.any(String),
      'sub-1',
      'top-1',
      2,
      { retryOf: 'job-1' },
    );
    expect(mockSubmitRun).toHaveBeenCalled();
  });

  it('parses crystal-trial currentLevel from label when metadata is missing', async () => {
    const job = makeJob({
      kind: 'crystal-trial',
      label: 'Crystal Trial L4 — Topic A',
      metadata: { enableReasoning: true },
    });

    await retryFailedJob(job);

    expect(mockPrepareCrystalTrialRunInput.mock.calls[0]?.[5]).toBe(3);
  });

  it('submits expansion retries with nextLevel from metadata', async () => {
    const job = makeJob({
      kind: 'topic-expansion-cards',
      label: 'Expansion L2 — Topic A',
      metadata: { enableReasoning: false, nextLevel: 2 },
    });
    await retryFailedJob(job);

    expect(mockPrepareTopicExpansionRunInput.mock.calls[0]?.[5]).toBe(2);
    expect(mockPrepareTopicExpansionRunInput.mock.calls[0]?.[7]).toEqual({ retryOf: 'job-1' });
  });

  it('parses expansion nextLevel from label when metadata lacks nextLevel', async () => {
    const job = makeJob({
      kind: 'topic-expansion-cards',
      label: 'Expansion L3 — Topic B',
      metadata: { enableReasoning: false },
    });
    await retryFailedJob(job);

    expect(mockPrepareTopicExpansionRunInput.mock.calls[0]?.[5]).toBe(3);
  });

  it('submits subject-graph-topics retries via prepare + submitRun', async () => {
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

    const job = makeJob({ kind: 'subject-graph-topics', topicId: null });
    await retryFailedJob(job);

    expect(mockPrepareSubjectGraphTopicsRunInput).toHaveBeenCalledWith(
      expect.anything(),
      'model:subjectGenerationTopics',
      expect.any(String),
      'sub-1',
      { topicName: 'Test' },
      { orchestratorRetryOf: 'job-1' },
    );
    expect(mockSubmitRun).toHaveBeenCalled();
  });

  it('prefers job metadata checklist for subject-graph jobs without manifest checklist', async () => {
    mockGetManifest.mockResolvedValue({
      subjects: [
        {
          id: 'sub-1',
          name: 'S',
          description: '',
          color: '#000',
          geometry: { gridTile: 'box' },
        },
      ],
    });

    const job = makeJob({
      kind: 'subject-graph-topics',
      topicId: null,
      metadata: {
        enableReasoning: false,
        checklist: { topicName: 'Metadata topic' },
      },
    });
    await retryFailedJob(job);

    expect(mockPrepareSubjectGraphTopicsRunInput.mock.calls[0]?.[4]).toEqual({
      topicName: 'Metadata topic',
    });
  });

  it('falls back to label topic for subject-graph jobs when checklist metadata is missing', async () => {
    mockGetManifest.mockResolvedValue({ subjects: [] });

    const job = makeJob({
      kind: 'subject-graph-edges',
      topicId: null,
      label: '[Edges] Curriculum — Label Topic',
      metadata: { enableReasoning: false },
    });
    await retryFailedJob(job);

    expect(mockPrepareSubjectGraphTopicsRunInput.mock.calls[0]?.[4]).toEqual({
      topicName: 'Label Topic',
    });
  });

  it('parses topic name from prefixed curriculum labels', async () => {
    mockGetManifest.mockResolvedValue({ subjects: [] });

    const job = makeJob({
      kind: 'subject-graph-topics',
      topicId: null,
      label: '[Topics] Curriculum — Quantum Foo',
      metadata: { enableReasoning: false },
    });
    await retryFailedJob(job);

    expect(mockPrepareSubjectGraphTopicsRunInput.mock.calls[0]?.[4]).toEqual({
      topicName: 'Quantum Foo',
    });
  });

  it('does not retry a completed job', async () => {
    const job = makeJob({ status: 'completed' });
    await retryFailedJob(job);

    expect(mockSubmitRun).not.toHaveBeenCalled();
    expect(mockPrepareTopicContentRunInput).not.toHaveBeenCalled();
  });
});

describe('retryFailedPipeline', () => {
  beforeEach(() => {
    resetStore();
    mockSubmitRun.mockClear();
    mockPrepareTopicContentRunInput.mockReset().mockResolvedValue(stubTopicRunInput());
    mockPrepareSubjectGraphTopicsRunInput.mockReset().mockResolvedValue({
      pipelineKind: 'subject-graph',
      subjectId: 'sub-1',
      stage: 'topics',
      snapshot: { pipeline_kind: 'subject-graph-topics' },
    });
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
      metadata: { enableReasoning: true },
    });

    useContentGenerationStore.setState({
      jobs: { j1: completedJob, j2: failedJob },
      pipelines: { p1: { id: 'p1', label: 'P', createdAt: 0, retryOf: null } },
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('p1');

    expect(mockPrepareTopicContentRunInput).toHaveBeenCalledTimes(1);
    const req = mockPrepareTopicContentRunInput.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(req.stage).toBe('study-cards');
    expect(req.resumeFromStage).toBe('study-cards');
    expect(req.enableReasoning).toBe(true);
    const rc = req.retryContext as { pipelineRetryOf: string; jobRetryOfByStage: Record<string, string> };
    expect(rc.pipelineRetryOf).toBe('p1');
    expect(rc.jobRetryOfByStage['study-cards']).toBe('j2');
  });

  it('does nothing when no jobs exist for pipeline', async () => {
    useContentGenerationStore.setState({
      jobs: {},
      pipelines: {},
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('nonexistent');
    expect(mockSubmitRun).not.toHaveBeenCalled();
  });

  it('delegates failed subject-graph-edges pipeline to retryFailedJob', async () => {
    mockGetManifest.mockResolvedValue({
      subjects: [
        {
          id: 'sub-1',
          name: 'S',
          description: '',
          color: '#000',
          geometry: { gridTile: 'box' },
          metadata: { checklist: { topicName: 'Pipeline topic' } },
        },
      ],
    });

    const failedJob = makeJob({
      id: 'j-edges',
      pipelineId: 'p-subj',
      kind: 'subject-graph-edges',
      status: 'failed',
      createdAt: 2,
      subjectId: 'sub-1',
      topicId: null,
    });

    useContentGenerationStore.setState({
      jobs: { 'j-edges': failedJob },
      pipelines: { 'p-subj': { id: 'p-subj', label: 'New subject: Pipeline topic', createdAt: 0, retryOf: null } },
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('p-subj');

    expect(mockPrepareSubjectGraphTopicsRunInput).toHaveBeenCalled();
  });
});

describe('content-generation:retry-failed terminal events', () => {
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetStore();
    mockSubmitRun.mockClear();
    mockPrepareTopicContentRunInput.mockReset().mockResolvedValue(stubTopicRunInput());
    mockPrepareCrystalTrialRunInput.mockReset().mockResolvedValue({});
    mockPrepareTopicExpansionRunInput.mockReset().mockResolvedValue({});
    mockPrepareSubjectGraphTopicsRunInput.mockReset().mockResolvedValue({});
    mockGetManifest.mockReset();
    emitSpy = vi.spyOn(appEventBus, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  it('emits when crystal-trial currentLevel cannot be derived', async () => {
    const job = makeJob({
      kind: 'crystal-trial',
      label: 'Crystal Trial — unparseable',
      metadata: { enableReasoning: false },
    });
    await retryFailedJob(job);

    expect(mockPrepareCrystalTrialRunInput).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(
      'content-generation:retry-failed',
      expect.objectContaining({
        subjectId: 'sub-1',
        topicId: 'top-1',
        jobLabel: 'Crystal Trial — unparseable',
        errorMessage: expect.stringContaining('current level'),
        jobId: 'job-1',
        failureInstanceId: expect.any(String),
        failureKey: expect.any(String),
      }),
    );
  });

  it('emits when expansion nextLevel cannot be derived', async () => {
    const job = makeJob({
      kind: 'topic-expansion-cards',
      label: 'Expansion no-level',
      metadata: { enableReasoning: false },
    });
    await retryFailedJob(job);

    expect(mockPrepareTopicExpansionRunInput).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(
      'content-generation:retry-failed',
      expect.objectContaining({
        jobLabel: 'Expansion no-level',
        errorMessage: expect.stringContaining('crystal level'),
        jobId: 'job-1',
        failureInstanceId: expect.any(String),
        failureKey: expect.any(String),
      }),
    );
  });

  it('emits when subject-graph retry context cannot be resolved', async () => {
    mockGetManifest.mockResolvedValue({ subjects: [] });

    const job = makeJob({
      kind: 'subject-graph-topics',
      topicId: null,
      label: 'unparseable label',
      metadata: { enableReasoning: false },
    });
    await retryFailedJob(job);

    expect(mockPrepareSubjectGraphTopicsRunInput).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(
      'content-generation:retry-failed',
      expect.objectContaining({
        subjectId: 'sub-1',
        jobLabel: 'unparseable label',
        errorMessage: expect.stringContaining('checklist not recoverable'),
        jobId: 'job-1',
        failureInstanceId: expect.any(String),
        failureKey: expect.any(String),
      }),
    );
  });

  it('emits for unsupported job kind in retryFailedJob', async () => {
    const job = makeJob({ kind: 'unknown-kind' as never, topicId: null });
    await retryFailedJob(job);

    expect(emitSpy).toHaveBeenCalledWith(
      'content-generation:retry-failed',
      expect.objectContaining({
        errorMessage: expect.stringContaining('unsupported kind'),
        jobId: 'job-1',
        failureInstanceId: expect.any(String),
        failureKey: expect.any(String),
      }),
    );
  });

  it('emits when retryFailedJob throws inside submitRun', async () => {
    mockSubmitRun.mockRejectedValueOnce(new Error('submit blew up'));
    const job = makeJob({ kind: 'topic-theory' });
    await retryFailedJob(job);

    expect(emitSpy).toHaveBeenCalledWith(
      'content-generation:retry-failed',
      expect.objectContaining({
        jobLabel: 'Theory — Test',
        errorMessage: 'submit blew up',
        jobId: 'job-1',
        failureInstanceId: expect.any(String),
        failureKey: expect.any(String),
      }),
    );
  });

  it('emits for unknown pipeline job kind in retryFailedPipeline', async () => {
    const failed = makeJob({
      id: 'jx',
      pipelineId: 'p1',
      kind: 'unknown-kind' as never,
      status: 'failed',
      topicId: null,
    });
    useContentGenerationStore.setState({
      jobs: { jx: failed },
      pipelines: { p1: { id: 'p1', label: 'New subject: Mystery', createdAt: 0, retryOf: null } },
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('p1');

    expect(emitSpy).toHaveBeenCalledWith(
      'content-generation:retry-failed',
      expect.objectContaining({
        jobLabel: 'New subject: Mystery',
        errorMessage: 'Cannot retry pipeline: unknown job kind',
        jobId: 'jx',
        failureInstanceId: expect.any(String),
        failureKey: expect.any(String),
      }),
    );
  });

  it('emits when retryFailedPipeline throws', async () => {
    mockSubmitRun.mockRejectedValueOnce(new Error('submit boom'));
    const failed = makeJob({
      id: 'j2',
      pipelineId: 'p1',
      kind: 'topic-theory',
      status: 'failed',
    });
    useContentGenerationStore.setState({
      jobs: { j2: failed },
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
        jobLabel: 'Pipeline P1',
        errorMessage: 'submit boom',
        jobId: 'j2',
        failureInstanceId: expect.any(String),
        failureKey: expect.any(String),
      }),
    );
  });
});
