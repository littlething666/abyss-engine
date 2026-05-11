import { describe, expect, it } from 'vitest';
import {
  WorkflowFail,
  isNonRetryableWorkflowFailCode,
  isWorkflowFailLike,
  toWorkflowRuntimeError,
  toWorkflowStepError,
  workflowFailFromUnknown,
  workflowFailureDetails,
} from './workflowErrors';

describe('workflow terminal error mapping', () => {
  it('classifies configuration, precondition, parse, and semantic validation failures as non-retryable', () => {
    expect(isNonRetryableWorkflowFailCode('config:invalid')).toBe(true);
    expect(isNonRetryableWorkflowFailCode('precondition:missing-topic')).toBe(true);
    expect(isNonRetryableWorkflowFailCode('parse:zod-shape')).toBe(true);
    expect(isNonRetryableWorkflowFailCode('validation:semantic-subject-graph')).toBe(true);
    expect(isNonRetryableWorkflowFailCode('semantic:topic-content')).toBe(true);
  });

  it('leaves transient LLM failures retryable at the Workflow runtime level', () => {
    const err = new WorkflowFail('llm:upstream-transient', 'provider failed');
    expect(isNonRetryableWorkflowFailCode(err.code)).toBe(false);
    expect(toWorkflowRuntimeError(err)).toBe(err);
    expect(toWorkflowStepError(err)).toBe(err);
  });

  it('maps terminal WorkflowFail values to Cloudflare NonRetryableError', () => {
    const runtimeError = toWorkflowRuntimeError(new WorkflowFail('config:invalid', 'missing OPENROUTER_API_KEY'));
    expect(runtimeError.name).toBe('NonRetryableError');
    expect(runtimeError.message).toBe('config:invalid: missing OPENROUTER_API_KEY');
    expect((runtimeError as Error & { code?: string }).code).toBe('config:invalid');
  });

  it('maps deterministic step failures to Cloudflare NonRetryableError before step retry policies run', () => {
    const runtimeError = toWorkflowStepError(new WorkflowFail('parse:zod-shape', 'invalid artifact JSON'));
    expect(runtimeError).toMatchObject({
      name: 'NonRetryableError',
      message: 'parse:zod-shape: invalid artifact JSON',
      code: 'parse:zod-shape',
    });
  });

  it('recognizes serialized WorkflowFail values returned across workflow step boundaries', () => {
    expect(isWorkflowFailLike({ name: 'WorkflowFail', code: 'precondition:missing-topic', message: 'Learning Content subject not found: game-theory' })).toBe(true);
    expect(isWorkflowFailLike({ name: 'WorkflowFail', message: 'config:invalid: missing OPENROUTER_API_KEY' })).toBe(true);
    expect(isWorkflowFailLike({ name: 'NonRetryableError', message: 'WorkflowFail: validation:semantic-card-pool-size: Card pool too small: 3 < 8' })).toBe(true);
    expect(isWorkflowFailLike({ name: 'Error', code: 'llm:upstream-transient', message: 'provider failed' })).toBe(false);
  });

  it('recovers code and message from explicit and message-encoded failures', () => {
    expect(workflowFailFromUnknown({ name: 'WorkflowFail', code: 'llm:rate-limit', message: 'openrouter 429' })).toMatchObject({
      code: 'llm:rate-limit',
      message: 'openrouter 429',
    });
    expect(workflowFailFromUnknown({ name: 'WorkflowFail', message: 'validation:provider-request: openrouter 400' })).toMatchObject({
      code: 'validation:provider-request',
      message: 'openrouter 400',
    });
    expect(workflowFailFromUnknown({ name: 'NonRetryableError', message: 'WorkflowFail: validation:semantic-card-pool-size: Card pool too small: 3 < 8' })).toMatchObject({
      code: 'validation:semantic-card-pool-size',
      message: 'Card pool too small: 3 < 8',
    });
    expect(workflowFailureDetails(new Error('boom'), 'llm:upstream-transient')).toEqual({
      code: 'llm:upstream-transient',
      message: 'boom',
    });
  });
});
