import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentGenerationJob, ContentGenerationPipeline } from '@/types/contentGeneration';

import { appEventBus } from '@/infrastructure/eventBus';
import { useContentGenerationStore } from './contentGenerationStore';
import { canRetryJob, canRetryPipeline, retryFailedJob, retryFailedPipeline } from './retryContentGeneration';

// ── Mocks ────────────────────────────────────────────
//
// Phase D dropped the `@/infrastructure/toast` import from
// retryContentGeneration entirely; routing-collapse failures now go
// through console.error + the `content-generation:retry-failed` bus event
// instead of toasts. We intentionally do NOT mock toast here — importing
// it would suggest the surface is still wired.

const mockRunTopicPipeline = vi.fn();
const mockRunExpansionJob = vi.fn();
const mockOrchExecute = vi.fn();
const mockGetManifest = vi.fn();
const mockGenerateTrialQuestions = vi.fn();

vi.mock('./pipelines/runTopicGenerationPipeline', () => ({
  runTopicGenerationPipeline: (...args: unknown[]) => mockRunTopicPipeline(...args),
}));

vi.mock('./jobs/runExpansionJob', () => ({
  runExpansionJob: (...args: unknown[]) => mockRunExpansionJob(...args),
}));

vi.mock('@/features/crystalTrial/generateTrialQuestions', () => ({
  generateTrialQuestions: (...args: unknown[]) => mockGenerateTrialQuestions(...args),
}));

vi.mock('@/features/subjectGeneration', () => ({
  createSubjectGenerationOrchestrator: () => ({ execute: mockOrchExecute }),
  resolveSubjectGenerationStageBindings: () => ({
    topics: {
      chat: {},
      model: 'topics-model',
      enableStreaming: true,
      enableReasoning: false,
    },
    edges: {
      chat: {},
      model: 'edges-model',
      enableStreaming: false,
      enableReasoning: false,
    },
  }),
}));

vi.mock('@/infrastructure/di', () => ({
  deckRepository: { getManifest: (...args: unknown[]) => mockGetManifest(...args) },
  deckWriter: {},
}));

vi.mock('@/infrastructure/llmInferenceRegistry', () => ({
  getChatCompletionsRepositoryForSurface: () => ({
    completeChat: vi.fn(),
    streamChat: vi.fn(),
  }),
}));

vi.mock('@/infrastructure/repositories/contentGenerationLogRepository', () => ({
  persistTerminalJob: vi.fn().mockResolvedValue(undefined),
  persistPipeline: vi.fn().mockResolvedValue(undefined),
  clearPersistedLogs: vi.fn().mockResolvedValue(undefined),
  loadPersistedLogs: vi.fn().mockResolvedValue({ jobs: [], pipelines: [] }),
}));

// ── Helpers ───────────────────────────────────────────

function resetStore(): void {
  useContentGenerationStore.setState({
    jobs: {},
    pipelines: {},
    abortControllers: {},
    pipelineAbortControllers: {},
    sessionAcknowledgedFailureKeys: {},
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

// ── Tests ─────────────────────────────────────────────

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
    mockGenerateTrialQuestions.mockReset();
  });

  it('calls runTopicGenerationPipeline for topic-theory jobs', async () => {
    const job = makeJob({ kind: 'topic-theory', metadata: { enableReasoning: true } });
    await retryFailedJob(job);

    expect(mockRunTopicPipeline).toHaveBeenCalledTimes(1);
    const params = mockRunTopicPipeline.mock.calls[0]?.[0];
    expect(params.stage).toBe('theory');
    expect(params.enableReasoning).toBe(true);
    expect(params.retryContext.pipelineRetryOf).toBeNull();
    expect(params.retryContext.jobRetryOfByStage.theory).toBe('job-1');
    expect(params.forceRegenerate).toBe(true);
  });

  it('calls runTopicGenerationPipeline for topic-study-cards jobs', async () => {
    const job = makeJob({ kind: 'topic-study-cards' });
    await retryFailedJob(job);

    expect(mockRunTopicPipeline).toHaveBeenCalledTimes(1);
    expect(mockRunTopicPipeline.mock.calls[0]?.[0]?.stage).toBe('study-cards');
  });

  it('calls runTopicGenerationPipeline for per-type mini-game jobs with override', async () => {
    const job = makeJob({ id: 'mg-1', kind: 'topic-mini-game-category-sort' });
    await retryFailedJob(job);

    expect(mockRunTopicPipeline).toHaveBeenCalledTimes(1);
    const params = mockRunTopicPipeline.mock.calls[0]?.[0];
    expect(params.stage).toBe('mini-games');
    expect(params.miniGameKindsOverride).toEqual(['CATEGORY_SORT']);
    expect(params.retryContext.jobRetryOfByStage['mini-games']).toBe('mg-1');
  });

  it('calls runTopicGenerationPipeline for topic-mini-games jobs', async () => {
    const job = makeJob({ kind: 'topic-mini-games' });
    await retryFailedJob(job);

    expect(mockRunTopicPipeline).toHaveBeenCalledTimes(1);
    expect(mockRunTopicPipeline.mock.calls[0]?.[0]?.stage).toBe('mini-games');
  });

  it('calls generateTrialQuestions for crystal-trial jobs using metadata currentLevel', async () => {
    const job = makeJob({
      kind: 'crystal-trial',
      label: 'Crystal Trial L3 — Topic A',
      metadata: { enableReasoning: true, currentLevel: 2 },
    });

    await retryFailedJob(job);

    expect(mockGenerateTrialQuestions).toHaveBeenCalledTimes(1);
    expect(mockGenerateTrialQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: expect.objectContaining({
          completeChat: expect.any(Function),
          streamChat: expect.any(Function),
        }),
        subjectId: 'sub-1',
        topicId: 'top-1',
        currentLevel: 2,
        retryOf: 'job-1',
      }),
    );
  });

  it('falls back to label parsing when crystal-trial metadata is missing', async () => {
    const job = makeJob({
      kind: 'crystal-trial',
      label: 'Crystal Trial L4 — Topic A',
      metadata: { enableReasoning: true },
    });

    await retryFailedJob(job);

    expect(mockGenerateTrialQuestions).toHaveBeenCalledTimes(1);
    expect(mockGenerateTrialQuestions.mock.calls[0]?.[0]?.currentLevel).toBe(3);
  });

  it('calls runExpansionJob with nextLevel from metadata', async () => {
    const job = makeJob({
      kind: 'topic-expansion-cards',
      label: 'Expansion L2 — Topic A',
      metadata: { enableReasoning: false, nextLevel: 2 },
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
      metadata: { enableReasoning: false },
    });
    await retryFailedJob(job);

    expect(mockRunExpansionJob).toHaveBeenCalledTimes(1);
    expect(mockRunExpansionJob.mock.calls[0]?.[0]?.nextLevel).toBe(3);
  });

  it('calls orchestrator.execute for subject-graph-topics jobs', async () => {
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

    expect(mockOrchExecute).toHaveBeenCalledTimes(1);
    const [req, deps] = mockOrchExecute.mock.calls[0] ?? [];
    expect(req.subjectId).toBe('sub-1');
    expect(deps.retryOf).toBe('job-1');
    expect(deps).toEqual(
      expect.objectContaining({
        stageBindings: expect.objectContaining({
          topics: expect.any(Object),
          edges: expect.any(Object),
        }),
      }),
    );
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

    expect(mockOrchExecute).toHaveBeenCalledTimes(1);
    const [req] = mockOrchExecute.mock.calls[0] ?? [];
    expect(req).toEqual(
      expect.objectContaining({
        subjectId: 'sub-1',
        checklist: { topicName: 'Metadata topic' },
      }),
    );
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

    expect(mockOrchExecute).toHaveBeenCalledTimes(1);
    const [req] = mockOrchExecute.mock.calls[0] ?? [];
    expect(req).toEqual(
      expect.objectContaining({
        subjectId: 'sub-1',
        checklist: { topicName: 'Label Topic' },
      }),
    );
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

    expect(mockOrchExecute).toHaveBeenCalledTimes(1);
    const [req] = mockOrchExecute.mock.calls[0] ?? [];
    expect(req).toEqual(
      expect.objectContaining({
        subjectId: 'sub-1',
        checklist: { topicName: 'Quantum Foo' },
      }),
    );
  });

  it('does not retry a completed job', async () => {
    const job = makeJob({ status: 'completed' });
    await retryFailedJob(job);

    expect(mockRunTopicPipeline).not.toHaveBeenCalled();
    expect(mockRunExpansionJob).not.toHaveBeenCalled();
    expect(mockOrchExecute).not.toHaveBeenCalled();
    expect(mockGenerateTrialQuestions).not.toHaveBeenCalled();
  });
});

describe('retryFailedPipeline', () => {
  beforeEach(() => {
    resetStore();
    mockRunTopicPipeline.mockReset();
    mockOrchExecute.mockReset();
    mockGetManifest.mockReset();
    mockGenerateTrialQuestions.mockReset();
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
      sessionAcknowledgedFailureKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('p1');

    expect(mockRunTopicPipeline).toHaveBeenCalledTimes(1);
    const params = mockRunTopicPipeline.mock.calls[0]?.[0];
    expect(params.resumeFromStage).toBe('study-cards');
    expect(params.enableReasoning).toBe(true);
    expect(params.retryContext.pipelineRetryOf).toBe('p1');
    expect(params.retryContext.jobRetryOfByStage['study-cards']).toBe('j2');
  });

  it('does nothing when no jobs exist for pipeline', async () => {
    useContentGenerationStore.setState({
      jobs: {},
      pipelines: {},
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionAcknowledgedFailureKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('nonexistent');
    expect(mockRunTopicPipeline).not.toHaveBeenCalled();
  });

  it('delegates failed subject-graph-edges pipeline to orchestrator retry', async () => {
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
      sessionAcknowledgedFailureKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('p-subj');

    expect(mockOrchExecute).toHaveBeenCalledTimes(1);
  });
});

describe('content-generation:retry-failed terminal events', () => {
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetStore();
    mockRunTopicPipeline.mockReset();
    mockRunExpansionJob.mockReset();
    mockOrchExecute.mockReset();
    mockGetManifest.mockReset();
    mockGenerateTrialQuestions.mockReset();
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

    expect(mockGenerateTrialQuestions).not.toHaveBeenCalled();
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

    expect(mockRunExpansionJob).not.toHaveBeenCalled();
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

    expect(mockOrchExecute).not.toHaveBeenCalled();
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

  it('emits when retryFailedJob throws', async () => {
    mockRunTopicPipeline.mockRejectedValueOnce(new Error('pipeline blew up'));
    const job = makeJob({ kind: 'topic-theory' });
    await retryFailedJob(job);

    expect(emitSpy).toHaveBeenCalledWith(
      'content-generation:retry-failed',
      expect.objectContaining({
        jobLabel: 'Theory — Test',
        errorMessage: 'pipeline blew up',
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
      sessionAcknowledgedFailureKeys: {},
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
    mockRunTopicPipeline.mockRejectedValueOnce(new Error('pipe boom'));
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
      sessionAcknowledgedFailureKeys: {},
      sessionRetryRoutingFailures: {},
    });

    await retryFailedPipeline('p1');

    expect(emitSpy).toHaveBeenCalledWith(
      'content-generation:retry-failed',
      expect.objectContaining({
        jobLabel: 'Pipeline P1',
        errorMessage: 'pipe boom',
        jobId: 'j2',
        failureInstanceId: expect.any(String),
        failureKey: expect.any(String),
      }),
    );
  });
});
