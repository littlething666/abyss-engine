/**
 * Workflow error classes — typed failure and abort signals.
 *
 * `WorkflowFail` writes `runs.error_code` / `runs.error_message`, transitions
 * to `failed_final`, appends a `failed` event, and re-throws so the Workflow
 * engine records the failure without auto-retrying the entire run.
 *
 * `WorkflowAbort` is thrown after a cooperative cancel is acknowledged.
 * It stops the Workflow gracefully without writing error metadata.
 */

import { NonRetryableError } from 'cloudflare:workflows';

const NON_RETRYABLE_WORKFLOW_FAIL_PREFIXES = [
  'config:',
  'precondition:',
  'parse:',
  'validation:',
  'semantic:',
  'retry:',
  'state:',
] as const;

export class WorkflowFail extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WorkflowFail';
    this.code = code;
  }
}

export class WorkflowAbort extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Workflow aborted: ${reason}`);
    this.name = 'WorkflowAbort';
    this.reason = reason;
  }
}

export function isNonRetryableWorkflowFailCode(code: string): boolean {
  return NON_RETRYABLE_WORKFLOW_FAIL_PREFIXES.some((prefix) => code.startsWith(prefix));
}

function isKnownWorkflowFailCode(code: string): boolean {
  return code.startsWith('llm:') || isNonRetryableWorkflowFailCode(code);
}

function stripErrorNamePrefix(message: string): string {
  let normalized = message.trim();
  for (const prefix of ['WorkflowFail: ', 'NonRetryableError: ', 'Error: ']) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length).trim();
    }
  }
  return normalized;
}

function parseWorkflowFailMessage(message: string): { code: string; message: string } | null {
  const normalized = stripErrorNamePrefix(message);
  const separatorIndex = normalized.indexOf(': ');
  if (separatorIndex <= 0) return null;

  const code = normalized.slice(0, separatorIndex);
  const parsedMessage = normalized.slice(separatorIndex + 2);
  if (!isKnownWorkflowFailCode(code)) return null;
  if (!parsedMessage) return null;

  return { code, message: parsedMessage };
}

export function workflowFailFromUnknown(err: unknown): WorkflowFail | null {
  if (err instanceof WorkflowFail) return err;
  if (typeof err !== 'object' || err === null) return null;

  const value = err as Record<string, unknown>;
  if (typeof value.code === 'string'
    && value.code.length > 0
    && isKnownWorkflowFailCode(value.code)
    && typeof value.message === 'string'
    && value.message.length > 0) {
    const parsed = parseWorkflowFailMessage(value.message);
    if (parsed && parsed.code === value.code) return new WorkflowFail(parsed.code, parsed.message);
    return new WorkflowFail(value.code, value.message);
  }

  if ((value.name === 'WorkflowFail' || value.name === 'NonRetryableError') && typeof value.message === 'string') {
    const parsed = parseWorkflowFailMessage(value.message);
    if (parsed) return new WorkflowFail(parsed.code, parsed.message);
  }

  return null;
}

export function isWorkflowFailLike(err: unknown): err is { name?: string; code?: string; message: string } {
  const fail = workflowFailFromUnknown(err);
  return Boolean(fail && isNonRetryableWorkflowFailCode(fail.code));
}

function toNonRetryableWorkflowError(error: WorkflowFail): Error {
  const runtimeError = new NonRetryableError(`${error.code}: ${error.message}`) as Error & { code?: string };
  runtimeError.code = error.code;
  return runtimeError;
}

export function toWorkflowRuntimeError(error: WorkflowFail): Error {
  if (!isNonRetryableWorkflowFailCode(error.code)) return error;
  return toNonRetryableWorkflowError(error);
}

/**
 * Convert deterministic workflow failures before throwing from `step.do`.
 *
 * Cloudflare Workflows retries failed steps according to the step retry policy.
 * Throwing `NonRetryableError` from inside a step callback is the durable escape
 * hatch for parser, schema, semantic, configuration, and precondition failures.
 */
export function toWorkflowStepError(err: unknown): unknown {
  const fail = workflowFailFromUnknown(err);
  if (fail && isNonRetryableWorkflowFailCode(fail.code)) {
    return toNonRetryableWorkflowError(fail);
  }
  return err;
}

export function workflowFailureDetails(err: unknown, fallbackCode: string): { code: string; message: string } {
  const fail = workflowFailFromUnknown(err);
  if (fail) return { code: fail.code, message: fail.message };

  return {
    code: fallbackCode,
    message: err instanceof Error ? err.message : String(err),
  };
}
