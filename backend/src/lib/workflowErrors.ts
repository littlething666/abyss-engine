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

export function toWorkflowRuntimeError(error: WorkflowFail): Error {
  if (!isNonRetryableWorkflowFailCode(error.code)) return error;
  return new NonRetryableError(`${error.code}: ${error.message}`, error.name);
}
