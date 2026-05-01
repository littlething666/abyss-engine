import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentGenerationJob } from '@/types/contentGeneration';

import { useContentGenerationStore } from '../contentGenerationStore';
import { buildPipelineFailureDebugBundle } from './buildPipelineFailureDebugBundle';

const bundleSourcePath = join(
  process.cwd(),
  'src/features/contentGeneration/debug/buildPipelineFailureDebugBundle.ts',
);

describe('buildPipelineFailureDebugBundle', () => {
  beforeEach(() => {
    useContentGenerationStore.setState({
      jobs: {},
      pipelines: {},
      abortControllers: {},
      pipelineAbortControllers: {},
    });
  });

  it('source does not import posthog infrastructure', () => {
    const src = readFileSync(bundleSourcePath, 'utf8');
    expect(src).not.toMatch(/posthog/i);
  });

  it('does not read localStorage or sessionStorage', () => {
    const lsSpy = vi.spyOn(window.localStorage, 'getItem');
    const ssSpy = vi.spyOn(window.sessionStorage, 'getItem');

    const job: ContentGenerationJob = {
      id: 'job-a',
      pipelineId: 'pipe-1',
      kind: 'topic-theory',
      status: 'failed',
      label: 'L',
      subjectId: 's',
      topicId: 't',
      createdAt: 1,
      startedAt: 2,
      finishedAt: 3,
      inputMessages: '[{"role":"user","content":"x"}]',
      rawOutput: 'out',
      reasoningText: null,
      error: 'e',
      parseError: null,
      retryOf: null,
      metadata: {
        model: 'm1',
        llmSurfaceId: 'topicContent',
        enableReasoning: false,
        includeOpenRouterReasoning: false,
        enableStreaming: false,
        provider: { usage: { total_tokens: 1 } },
      },
    };

    useContentGenerationStore.setState({ jobs: { [job.id]: job } });

    const bundle = buildPipelineFailureDebugBundle(job, {
      topicLabel: 'TL',
      pipelineStage: 'full',
      failedStage: 'theory',
    });

    expect(bundle.jobId).toBe('job-a');
    expect(bundle.llmRequestMessages).toEqual([{ role: 'user', content: 'x' }]);
    expect(lsSpy).not.toHaveBeenCalled();
    expect(ssSpy).not.toHaveBeenCalled();

    lsSpy.mockRestore();
    ssSpy.mockRestore();
  });
});
