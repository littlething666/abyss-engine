import { describe, expect, it } from 'vitest';
import { WorkflowFail, isNonRetryableWorkflowFailCode, toWorkflowRuntimeError } from './workflowErrors';

describe('workflow terminal error mapping', () => {
  it('classifies configuration, precondition, parse, and semantic validation failures as non-retryable', () => {
    expect(isNonRetryableWorkflowFailCode('config:invalid')).toBe(true);
    expect(isNonRetryableWorkflowFailCode('precondition:missing-topic')).toBe(true);
    expect(isNonRetryableWorkflowFailCode('parse:zod-shape')).toBe(true);
    expect(isNonRetryableWorkflowFailCode('validation:semantic-subject-graph')).toBe(true);
  });

  it('leaves transient LLM failures retryable at the Workflow runtime level', () => {
    const err = new WorkflowFail('llm:upstream-5xx', 'provider failed');
    expect(isNonRetryableWorkflowFailCode(err.code)).toBe(false);
    expect(toWorkflowRuntimeError(err)).toBe(err);
  });

  it('maps terminal WorkflowFail values to Cloudflare NonRetryableError', () => {
    const runtimeError = toWorkflowRuntimeError(new WorkflowFail('config:invalid', 'missing OPENROUTER_API_KEY'));
    expect(runtimeError.name).toBe('WorkflowFail');
    expect(runtimeError.message).toBe('config:invalid: missing OPENROUTER_API_KEY');
  });
});
