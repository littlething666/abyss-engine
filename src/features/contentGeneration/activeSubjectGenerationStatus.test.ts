import { describe, expect, it } from 'vitest';

import type {
  ContentGenerationJob,
  ContentGenerationPipeline,
} from '@/types/contentGeneration';

import { activeSubjectGenerationStatus } from './activeSubjectGenerationStatus';

function makePipeline(
  overrides: Partial<ContentGenerationPipeline> = {},
): ContentGenerationPipeline {
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

describe('activeSubjectGenerationStatus', () => {
  it('returns the active topics-stage status when topic lattice generation is in flight', () => {
    const status = activeSubjectGenerationStatus({
      jobs: { 'job-1': makeJob() },
      pipelines: { 'pipeline-1': makePipeline() },
    });

    expect(status).toEqual({
      phase: 'topics',
      status: 'streaming',
      label: 'Calculus',
      subjectId: 'calculus',
      pipelineId: 'pipeline-1',
    });
  });

  it('prefers an active edges-stage job over older subject-generation failures', () => {
    const status = activeSubjectGenerationStatus({
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
    });

    expect(status).toEqual({
      phase: 'edges',
      status: 'saving',
      label: 'Calculus',
      subjectId: 'calculus',
      pipelineId: 'pipeline-1',
    });
  });

  it('surfaces the most recent failed or aborted subject-generation pipeline when nothing is active', () => {
    const status = activeSubjectGenerationStatus({
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
          status: 'aborted',
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
    });

    expect(status).toEqual({
      phase: 'failed',
      status: 'aborted',
      label: 'Linear Algebra',
      subjectId: 'linear-algebra',
      pipelineId: 'pipeline-2',
    });
  });

  it('returns null when no subject-generation jobs are present', () => {
    const status = activeSubjectGenerationStatus({
      jobs: {
        topic: makeJob({
          id: 'topic',
          kind: 'topic-theory',
          topicId: 'limits',
        }),
      },
      pipelines: {},
    });

    expect(status).toBeNull();
  });
});
