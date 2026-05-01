import { describe, expect, it } from 'vitest';

import type { ContentGenerationJob } from '@/types/contentGeneration';

import { countManualRetryDepth } from './countManualRetryDepth';

function job(id: string, retryOf: string | null): ContentGenerationJob {
  return {
    id,
    pipelineId: null,
    kind: 'subject-graph-topics',
    status: 'failed',
    label: 'x',
    subjectId: 's',
    topicId: null,
    createdAt: 0,
    startedAt: null,
    finishedAt: null,
    inputMessages: null,
    rawOutput: '',
    reasoningText: null,
    error: null,
    parseError: null,
    retryOf,
    metadata: null,
  };
}

describe('countManualRetryDepth', () => {
  it('returns 0 when no retryOf', () => {
    expect(countManualRetryDepth(undefined, {})).toBe(0);
  });

  it('counts retryOf chain length', () => {
    const jobs: Record<string, ContentGenerationJob> = {
      a: job('a', null),
      b: job('b', 'a'),
      c: job('c', 'b'),
    };
    expect(countManualRetryDepth('a', jobs)).toBe(1);
    expect(countManualRetryDepth('b', jobs)).toBe(2);
    expect(countManualRetryDepth('c', jobs)).toBe(3);
  });

  it('stops on cycle', () => {
    const jobs: Record<string, ContentGenerationJob> = {
      a: job('a', 'b'),
      b: job('b', 'a'),
    };
    expect(countManualRetryDepth('a', jobs)).toBe(2);
  });
});
