import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentGenerationJob } from '@/types/contentGeneration';

import { failureKeyForJob } from './failureKeys';
import { MAX_PERSISTED_LOGS, useContentGenerationStore } from './contentGenerationStore';

vi.mock('@/infrastructure/repositories/contentGenerationLogRepository', () => ({
  persistTerminalJob: vi.fn().mockResolvedValue(undefined),
  persistPipeline: vi.fn().mockResolvedValue(undefined),
  clearPersistedLogs: vi.fn().mockResolvedValue(undefined),
  loadPersistedLogs: vi.fn().mockResolvedValue({ jobs: [], pipelines: [] }),
}));

import { clearPersistedLogs } from '@/infrastructure/repositories/contentGenerationLogRepository';

function baseJob(overrides: Partial<ContentGenerationJob> = {}): ContentGenerationJob {
  return {
    id: 'j1',
    pipelineId: null,
    kind: 'topic-theory',
    status: 'completed',
    label: 'L',
    subjectId: null,
    topicId: null,
    createdAt: 1,
    startedAt: 1,
    finishedAt: 2,
    inputMessages: null,
    rawOutput: '',
    reasoningText: null,
    error: null,
    parseError: null,
    retryOf: null,
    metadata: null,
    ...overrides,
  };
}

describe('contentGenerationStore', () => {
  beforeEach(() => {
    useContentGenerationStore.setState({
      jobs: {},
      pipelines: {},
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });
    vi.mocked(clearPersistedLogs).mockClear();
  });

  it('hydrateFromPersisted merges jobs and pipelines', () => {
    const job = baseJob({ id: 'a', finishedAt: 10 });
    useContentGenerationStore.getState().hydrateFromPersisted(
      [job],
      [{ id: 'p1', label: 'P', createdAt: 1, retryOf: null }],
    );
    expect(useContentGenerationStore.getState().jobs.a).toEqual(job);
    expect(useContentGenerationStore.getState().pipelines.p1?.label).toBe('P');
  });

  it('hydrateFromPersisted accepts subject-graph-topics jobs like other kinds', () => {
    const job = baseJob({
      id: 'subj-graph-1',
      kind: 'subject-graph-topics',
      label: '[Topics] Curriculum — Test',
      subjectId: 'test-subject',
      topicId: null,
      finishedAt: 20,
    });
    useContentGenerationStore.getState().hydrateFromPersisted([job], []);
    expect(useContentGenerationStore.getState().jobs['subj-graph-1']?.kind).toBe('subject-graph-topics');
  });

  it('hydrateFromPersisted does not add sessionFailureAttentionKeys for failed persisted jobs', () => {
    const failed = baseJob({
      id: 'hydrated-fail',
      status: 'failed',
      subjectId: 's',
      topicId: 't',
      label: 'Topic — X',
      finishedAt: 99,
    });
    useContentGenerationStore.getState().hydrateFromPersisted([failed], []);
    expect(useContentGenerationStore.getState().sessionFailureAttentionKeys).toEqual({});
  });

  it('finishJob(status failed) adds sessionFailureAttentionKeys for alert-eligible jobs', () => {
    const jobId = 'fail-1';
    useContentGenerationStore.getState().registerJob(
      {
        ...baseJob({
          id: jobId,
          status: 'streaming',
          subjectId: 's',
          topicId: 't',
          label: 'Topic — T',
        }),
      },
      new AbortController(),
    );
    useContentGenerationStore.getState().finishJob(jobId, 'failed');
    const fk = failureKeyForJob(jobId);
    expect(useContentGenerationStore.getState().sessionFailureAttentionKeys[fk]).toBe(true);
  });

  it('acknowledgeFailureKey removes the attention key', () => {
    const fk = failureKeyForJob('x');
    useContentGenerationStore.setState({
      sessionFailureAttentionKeys: { [fk]: true },
    });
    useContentGenerationStore.getState().acknowledgeFailureKey(fk);
    expect(useContentGenerationStore.getState().sessionFailureAttentionKeys[fk]).toBeUndefined();
  });

  it('acknowledgeAllFailureAttention clears attention keys and retry-routing surfaces', () => {
    const fk = failureKeyForJob('j1');
    const retryKey = 'cg:retry-routing:inst';
    useContentGenerationStore.setState({
      sessionFailureAttentionKeys: { [fk]: true },
      sessionRetryRoutingFailures: {
        [retryKey]: {
          failureKey: retryKey,
          failureInstanceId: 'inst',
          originalJobId: 'orig',
          subjectId: 's',
          jobLabel: 'L',
          errorMessage: 'e',
          createdAt: 1,
        },
      },
    });
    useContentGenerationStore.getState().acknowledgeAllFailureAttention();
    expect(useContentGenerationStore.getState().sessionFailureAttentionKeys).toEqual({});
    expect(useContentGenerationStore.getState().sessionRetryRoutingFailures).toEqual({});
  });

  it('registerJob with retryOf removes prior job failure attention', () => {
    const prevId = 'prev-failed';
    useContentGenerationStore.getState().registerJob(
      {
        id: prevId,
        pipelineId: null,
        kind: 'topic-theory',
        status: 'failed',
        label: 'L',
        subjectId: 's',
        topicId: 't',
        createdAt: 1,
        startedAt: 1,
        finishedAt: 2,
        inputMessages: null,
        rawOutput: '',
        reasoningText: null,
        error: 'e',
        parseError: null,
        retryOf: null,
        metadata: null,
      },
      new AbortController(),
    );
    const fk = failureKeyForJob(prevId);
    useContentGenerationStore.setState({
      sessionFailureAttentionKeys: { [fk]: true },
    });
    expect(useContentGenerationStore.getState().sessionFailureAttentionKeys[fk]).toBe(true);
    useContentGenerationStore.getState().registerJob(
      {
        id: 'new-job',
        pipelineId: null,
        kind: 'topic-theory',
        status: 'pending',
        label: 'L2',
        subjectId: 's',
        topicId: 't',
        createdAt: 2,
        startedAt: null,
        finishedAt: null,
        inputMessages: null,
        rawOutput: '',
        reasoningText: null,
        error: null,
        parseError: null,
        retryOf: prevId,
        metadata: null,
      },
      new AbortController(),
    );
    expect(useContentGenerationStore.getState().sessionFailureAttentionKeys[fk]).toBeUndefined();
  });

  it('clearCompletedJobs removes terminal jobs and calls clearPersistedLogs', () => {
    useContentGenerationStore.setState({
      jobs: { a: baseJob({ id: 'a', status: 'completed' }) },
      pipelines: {},
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });
    useContentGenerationStore.getState().clearCompletedJobs();
    expect(Object.keys(useContentGenerationStore.getState().jobs)).toHaveLength(0);
    expect(clearPersistedLogs).toHaveBeenCalledTimes(1);
  });

  it('pruneCompletedJobs caps in-memory terminal logs', () => {
    const jobs: Record<string, ContentGenerationJob> = {};
    for (let i = 0; i < MAX_PERSISTED_LOGS + 5; i += 1) {
      const id = `id-${i}`;
      jobs[id] = baseJob({
        id,
        status: 'completed',
        finishedAt: 1000 + i,
      });
    }
    useContentGenerationStore.setState({
      jobs,
      pipelines: {},
      abortControllers: {},
      pipelineAbortControllers: {},
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });
    useContentGenerationStore.getState().pruneCompletedJobs();
    expect(Object.keys(useContentGenerationStore.getState().jobs).length).toBe(MAX_PERSISTED_LOGS);
  });
});
