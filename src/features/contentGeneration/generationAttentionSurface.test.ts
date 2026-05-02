import { describe, expect, it } from 'vitest';

import type {
  ContentGenerationJob,
  ContentGenerationPipeline,
} from '@/types/contentGeneration';

import { failureKeyForJob, failureKeyForRetryRoutingInstance } from './failureKeys';
import { generationAttentionSurface } from './generationAttentionSurface';

function makePipeline(overrides: Partial<ContentGenerationPipeline> = {}): ContentGenerationPipeline {
  return {
    id: 'pipeline-1',
    label: 'New subject: Calculus',
    createdAt: 100,
    retryOf: null,
    ...overrides,
  };
}

function makeJob(overrides: Partial<ContentGenerationJob> = {}): ContentGenerationJob {
  return {
    id: 'job-1',
    pipelineId: 'pipeline-1',
    kind: 'subject-graph-topics',
    status: 'streaming',
    label: '[Topics] Curriculum — Calculus',
    subjectId: 'calculus',
    topicId: null,
    createdAt: 100,
    startedAt: 110,
    finishedAt: null,
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

const emptySession = {
  sessionFailureAttentionKeys: {} as Record<string, true>,
  sessionRetryRoutingFailures: {},
};

describe('generationAttentionSurface', () => {
  it('returns active topics-stage pips when topic lattice generation is in flight', () => {
    const surface = generationAttentionSurface({
      jobs: { 'job-1': makeJob() },
      pipelines: { 'pipeline-1': makePipeline() },
      ...emptySession,
    });

    expect(surface.subjectGraphPips).toBe(1);
    expect(surface.subjectGraphActivePhase).toBe('topics');
    expect(surface.subjectGraphLabel).toBe('Calculus');
    expect(surface.subjectGraphSubjectId).toBe('calculus');
    expect(surface.subjectGraphPipelineId).toBe('pipeline-1');
    expect(surface.primaryFailure).toBeNull();
  });

  it('prefers an active edges-stage job over older subject-generation failures', () => {
    const surface = generationAttentionSurface({
      jobs: {
        failed: makeJob({
          id: 'failed',
          status: 'failed',
          finishedAt: 500,
        }),
        active: makeJob({
          id: 'active',
          kind: 'subject-graph-edges',
          status: 'saving',
          createdAt: 700,
          startedAt: 710,
        }),
      },
      pipelines: { 'pipeline-1': makePipeline() },
      sessionFailureAttentionKeys: {
        [failureKeyForJob('failed')]: true,
      },
      sessionRetryRoutingFailures: {},
    });

    expect(surface.subjectGraphPips).toBe(2);
    expect(surface.subjectGraphActivePhase).toBe('edges');
    expect(surface.primaryFailure).toBeNull();
  });

  it('does not alert on aborted subject-graph jobs', () => {
    const surface = generationAttentionSurface({
      jobs: {
        aborted: makeJob({
          id: 'aborted',
          kind: 'subject-graph-edges',
          status: 'aborted',
          finishedAt: 450,
        }),
      },
      pipelines: { 'pipeline-1': makePipeline() },
      ...emptySession,
    });

    expect(surface.primaryFailure).toBeNull();
    expect(surface.subjectGraphPips).toBe(0);
  });

  it('surfaces the most recent failed subject-generation pipeline when nothing is active', () => {
    const fkOlder = failureKeyForJob('older');
    const fkNewer = failureKeyForJob('newer');
    const surface = generationAttentionSurface({
      jobs: {
        older: makeJob({
          id: 'older',
          pipelineId: 'pipeline-1',
          status: 'failed',
          finishedAt: 300,
        }),
        newer: makeJob({
          id: 'newer',
          pipelineId: 'pipeline-2',
          kind: 'subject-graph-edges',
          status: 'failed',
          createdAt: 400,
          finishedAt: 450,
          label: '[Edges] Curriculum — Linear Algebra',
          subjectId: 'linear-algebra',
        }),
      },
      pipelines: {
        'pipeline-1': makePipeline(),
        'pipeline-2': makePipeline({
          id: 'pipeline-2',
          label: 'New subject: Linear Algebra',
          createdAt: 400,
        }),
      },
      sessionFailureAttentionKeys: { [fkOlder]: true, [fkNewer]: true },
      sessionRetryRoutingFailures: {},
    });

    expect(surface.primaryFailure?.kind).toBe('subject-graph');
    expect(surface.primaryFailure?.jobId).toBe('newer');
    expect(surface.primaryFailure?.failureKey).toBe(failureKeyForJob('newer'));
    expect(surface.subjectGraphPips).toBe(2);
  });

  it('failed job with no session attention key returns primaryFailure null', () => {
    const surface = generationAttentionSurface({
      jobs: {
        j: makeJob({ id: 'failed-id', status: 'failed', finishedAt: 100 }),
      },
      pipelines: { 'pipeline-1': makePipeline() },
      sessionFailureAttentionKeys: {},
      sessionRetryRoutingFailures: {},
    });
    expect(surface.primaryFailure).toBeNull();
  });

  it('failed job with session attention key returns primaryFailure', () => {
    const fk = failureKeyForJob('failed-id');
    const surface = generationAttentionSurface({
      jobs: {
        j: makeJob({ id: 'failed-id', status: 'failed', finishedAt: 100 }),
      },
      pipelines: { 'pipeline-1': makePipeline() },
      sessionFailureAttentionKeys: { [fk]: true },
      sessionRetryRoutingFailures: {},
    });
    expect(surface.primaryFailure?.failureKey).toBe(fk);
    expect(surface.primaryFailure?.kind).toBe('subject-graph');
  });

  it('prioritizes retry-routing collapse over topic failures', () => {
    const retryKey = failureKeyForRetryRoutingInstance('inst-1');
    const surface = generationAttentionSurface({
      jobs: {
        topic: makeJob({
          id: 'topic-f',
          kind: 'topic-theory',
          pipelineId: 'pipeline-1',
          topicId: 't1',
          subjectId: 's1',
          status: 'failed',
          finishedAt: 900,
        }),
      },
      pipelines: { 'pipeline-1': makePipeline({ id: 'pipeline-1', label: 'P' }) },
      sessionFailureAttentionKeys: { [failureKeyForJob('topic-f')]: true },
      sessionRetryRoutingFailures: {
        [retryKey]: {
          failureKey: retryKey,
          failureInstanceId: 'inst-1',
          originalJobId: 'orig',
          subjectId: 's1',
          jobLabel: 'Retry label',
          errorMessage: 'collapse',
          createdAt: 800,
        },
      },
    });

    expect(surface.primaryFailure?.kind).toBe('retry-routing');
  });

  it('returns referentially stable primaryFailure when input state is unchanged (useShallow / useSyncExternalStore safe)', () => {
    const fk = failureKeyForJob('failed-theory');
    const state = {
      jobs: {
        f: makeJob({
          id: 'failed-theory',
          kind: 'topic-theory',
          pipelineId: 'pipeline-1',
          topicId: 't1',
          subjectId: 's1',
          status: 'failed',
          finishedAt: 900,
          label: 'Topic — PD',
          error: 'Invalid grounding sources',
        }),
      },
      pipelines: { 'pipeline-1': makePipeline({ id: 'pipeline-1', label: 'P' }) },
      sessionFailureAttentionKeys: { [fk]: true } as Record<string, true>,
      sessionRetryRoutingFailures: {},
    };
    const a = generationAttentionSurface(state);
    const b = generationAttentionSurface(state);
    expect(a.primaryFailure).toBe(b.primaryFailure);
  });

  it('returns null primary failure when only non-subject jobs exist without failure', () => {
    const surface = generationAttentionSurface({
      jobs: {
        topic: makeJob({
          id: 'topic',
          kind: 'topic-theory',
          topicId: 'limits',
          subjectId: 's',
          status: 'completed',
          finishedAt: 200,
        }),
      },
      pipelines: {},
      ...emptySession,
    });

    expect(surface.primaryFailure).toBeNull();
  });
});
