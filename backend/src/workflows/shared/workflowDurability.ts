import type { IRunsRepo } from '../../repositories/runsRepo';
import type { TypedEventType } from '../../contracts/typedEvents';
import type { ArtifactKind } from '../../contracts/generationContracts';

export const WORKFLOW_LLM_STEP_RETRY = {
  retries: {
    limit: 2,
    delay: '5 seconds',
    backoff: 'exponential',
  },
} as const;

export function workflowStatusEventKey(status: string, stage?: string): string {
  return stage ? `status:${stage}:${status}` : `status:${status}`;
}

export function workflowArtifactReadyEventKey(kind: ArtifactKind, inputHash: string): string {
  return `artifact.ready:${kind}:${inputHash}`;
}

export function workflowStageProgressEventKey(stage: string, note: string): string {
  return `stage.progress:${stage}:${note}`;
}

export function workflowTerminalEventKey(terminal: 'completed' | 'failed' | 'cancelled'): string {
  return `terminal:${terminal}`;
}

export function appendWorkflowEventOnce<T extends TypedEventType>(
  runs: IRunsRepo,
  runId: string,
  deviceId: string,
  semanticKey: string,
  event: { type: T; payload: Record<string, unknown> },
) {
  return runs.appendTypedOnce(runId, deviceId, semanticKey, event);
}
