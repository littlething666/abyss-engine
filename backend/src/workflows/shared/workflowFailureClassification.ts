import { WorkflowFail, isWorkflowFailLike, toWorkflowRuntimeError } from '../../lib/workflowErrors';

export interface ClassifiedWorkflowTerminalError {
  code: string;
  message: string;
  runtimeError: Error;
}

export function classifyWorkflowTerminalError(err: unknown): ClassifiedWorkflowTerminalError {
  if (err instanceof WorkflowFail) {
    return { code: err.code, message: err.message, runtimeError: toWorkflowRuntimeError(err) };
  }

  if (isWorkflowFailLike(err)) {
    const fail = new WorkflowFail(err.code, err.message);
    return { code: fail.code, message: fail.message, runtimeError: toWorkflowRuntimeError(fail) };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'state:unexpected-workflow-error',
    message,
    runtimeError: err instanceof Error ? err : new Error(message),
  };
}
