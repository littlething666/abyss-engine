import { WorkflowFail } from '../lib/workflowErrors';
import { isBackendGenerationJobKind, resolveGenerationJobPolicy } from './resolveGenerationPolicy';
import type {
  BackendGenerationJobKind,
  GenerationPolicy,
  ResolvedGenerationJobPolicy,
} from './types';

export interface BackendGenerationPolicySnapshotFields {
  model_id: string;
  generation_policy_hash: string;
  provider_healing_requested: true;
}

export type BackendPolicyBoundSnapshot = Record<string, unknown> & BackendGenerationPolicySnapshotFields;

function requireBackendGenerationJobKind(value: unknown): BackendGenerationJobKind {
  if (typeof value !== 'string') {
    throw new WorkflowFail('config:invalid', 'snapshot.pipeline_kind must be a backend generation job kind string');
  }

  if (isBackendGenerationJobKind(value)) {
    return value;
  }

  throw new WorkflowFail('config:invalid', `unsupported backend generation job kind in snapshot.pipeline_kind: ${value}`);
}

export async function resolveSnapshotGenerationPolicy(
  deviceId: string,
  snapshot: Record<string, unknown>,
  policy?: GenerationPolicy,
): Promise<ResolvedGenerationJobPolicy> {
  return resolveGenerationJobPolicy(
    deviceId,
    requireBackendGenerationJobKind(snapshot.pipeline_kind),
    policy,
  );
}

export async function bindBackendGenerationPolicyToSnapshot(
  deviceId: string,
  snapshot: Record<string, unknown>,
  policy?: GenerationPolicy,
): Promise<BackendPolicyBoundSnapshot> {
  const resolved = await resolveSnapshotGenerationPolicy(deviceId, snapshot, policy);
  return {
    ...snapshot,
    model_id: resolved.modelId,
    generation_policy_hash: resolved.generationPolicyHash,
    provider_healing_requested: resolved.providerHealingRequested,
  };
}
