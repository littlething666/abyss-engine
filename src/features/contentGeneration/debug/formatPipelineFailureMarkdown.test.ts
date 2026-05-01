import { describe, expect, it } from 'vitest';

import { PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION, type PipelineFailureDebugBundle } from '@/types/pipelineFailureDebug';

import { formatPipelineFailureMarkdown } from './formatPipelineFailureMarkdown';

function minimalBundle(overrides: Partial<PipelineFailureDebugBundle>): PipelineFailureDebugBundle {
  return {
    schemaVersion: PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION,
    pipelineId: 'p1',
    jobId: 'j1',
    jobKind: 'topic-study-cards',
    status: 'failed',
    subjectId: 'sub',
    topicId: 'top',
    topicLabel: 'Topic L',
    pipelineStage: 'full',
    failedStage: 'study-cards',
    retryOf: null,
    retryChainDepth: 0,
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_012_345,
    durationMs: 12_345,
    error: 'Generated cards failed validation (2 issues)',
    parseError: 'Generated cards failed validation (2 issues)',
    model: 'test-model',
    requestParams: { llmSurfaceId: 'topicContent', enableReasoning: true },
    llmRequestMessages: [{ role: 'user', content: 'hi' }],
    llmRawResponse: '{"cards":[]}',
    llmReasoningText: null,
    providerMetadata: { usage: {} },
    validationFailures: [
      {
        cardId: 'c1',
        index: 0,
        code: 'correct_answer_not_in_options',
        message: 'correctAnswer must match one option',
        severity: 'critical',
      },
    ],
    qualityReport: null,
    groundingSummary: { sourceCount: 0 },
    groundingSources: [],
    ...overrides,
  };
}

describe('formatPipelineFailureMarkdown', () => {
  it('includes required sections and validation codes', () => {
    const md = formatPipelineFailureMarkdown(minimalBundle({}));
    expect(md).toContain('# Abyss Pipeline Failure');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Validation Failures');
    expect(md).toContain('correct_answer_not_in_options');
    expect(md).toContain('## Model & Request Params');
    expect(md).toContain('test-model');
  });

  it('uses a dynamic fence wider than triple-backticks in raw output', () => {
    const tricky = 'text\n````\nembedded\n````\nend';
    const md = formatPipelineFailureMarkdown(minimalBundle({ llmRawResponse: tricky }));
    expect(md).toContain('## LLM Raw Response');
    expect(md).toContain(`${'`'.repeat(5)}txt`);
    expect(md).toContain(tricky);
  });
});
