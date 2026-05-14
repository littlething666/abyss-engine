import { canonicalJson } from '../contracts/generationContracts';
import { WorkflowFail } from '../lib/workflowErrors';
import { DEFAULT_GENERATION_POLICY } from './defaultPolicy';
import { parseGenerationPolicy } from './parseGenerationPolicy';
import {
  BACKEND_GENERATION_JOB_KINDS,
  type BackendGenerationJobKind,
  type GenerationPolicy,
  type ResolvedGenerationJobPolicy,
} from './types';

const HASH_PREFIX = 'gpol_';
const ENCODER = new TextEncoder();
const JOB_KIND_SET = new Set<string>(BACKEND_GENERATION_JOB_KINDS);

function bytesToHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < view.length; i += 1) {
    const hex = view[i]!.toString(16);
    out += hex.length === 1 ? `0${hex}` : hex;
  }
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) {
    throw new WorkflowFail('config:invalid', 'WebCrypto subtle is unavailable for generation policy hashing');
  }
  return bytesToHex(await subtle.digest('SHA-256', ENCODER.encode(input)));
}

export function isBackendGenerationJobKind(value: string): value is BackendGenerationJobKind {
  return JOB_KIND_SET.has(value);
}

/** Deterministic hash of the validated backend generation policy. */
export async function generationPolicyHash(policy: GenerationPolicy): Promise<string> {
  const parsed = parseGenerationPolicy(policy);
  return `${HASH_PREFIX}${await sha256Hex(canonicalJson(parsed))}`;
}

/**
 * Resolve the backend-owned model/provider policy for one generation job.
 * `deviceId` is accepted now to keep the public seam stable for future
 * backend-only operator/device cohorts; v1 ignores it intentionally.
 */
export async function resolveGenerationJobPolicy(
  _deviceId: string,
  jobKind: BackendGenerationJobKind,
  policy: GenerationPolicy = DEFAULT_GENERATION_POLICY,
): Promise<ResolvedGenerationJobPolicy> {
  if (!isBackendGenerationJobKind(jobKind)) {
    throw new WorkflowFail('config:invalid', `unsupported backend generation job kind: ${jobKind}`);
  }

  const parsed = parseGenerationPolicy(policy);
  const job = parsed.jobs[jobKind];
  if (!job) {
    throw new WorkflowFail('config:invalid', `missing backend generation policy for job kind: ${jobKind}`);
  }

  return {
    jobKind,
    provider: parsed.provider,
    modelId: job.modelId,
    temperature: job.temperature,
    providerHealingRequested: true,
    generationPolicyHash: await generationPolicyHash(parsed),
    policyVersion: parsed.version,
  };
}
