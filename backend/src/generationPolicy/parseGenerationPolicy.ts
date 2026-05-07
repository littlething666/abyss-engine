import { WorkflowFail } from '../lib/workflowErrors';
import {
  BACKEND_GENERATION_JOB_KINDS,
  type BackendGenerationJobKind,
  type GenerationJobPolicy,
  type GenerationPolicy,
} from './types';

const JOB_KIND_SET = new Set<string>(BACKEND_GENERATION_JOB_KINDS);

function fail(message: string): never {
  throw new WorkflowFail('config:invalid', `invalid backend generation policy: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string,
): void {
  const expected = new Set(expectedKeys);
  const actual = Object.keys(value);
  const missing = expectedKeys.filter((key) => !(key in value));
  const extras = actual.filter((key) => !expected.has(key));
  if (missing.length > 0) fail(`${path} missing required key(s): ${missing.join(', ')}`);
  if (extras.length > 0) fail(`${path} contains unsupported key(s): ${extras.join(', ')}`);
}

function parseJobPolicy(value: unknown, jobKind: BackendGenerationJobKind): GenerationJobPolicy {
  if (!isPlainObject(value)) fail(`jobs.${jobKind} must be an object`);

  const allowedKeys = 'temperature' in value ? ['modelId', 'temperature'] : ['modelId'];
  assertExactKeys(value, allowedKeys, `jobs.${jobKind}`);

  if (typeof value.modelId !== 'string' || value.modelId.trim().length === 0) {
    fail(`jobs.${jobKind}.modelId must be a non-empty string`);
  }

  if ('temperature' in value) {
    if (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature)) {
      fail(`jobs.${jobKind}.temperature must be a finite number`);
    }
    if (value.temperature < 0 || value.temperature > 2) {
      fail(`jobs.${jobKind}.temperature must be between 0 and 2`);
    }
    return { modelId: value.modelId, temperature: value.temperature };
  }

  return { modelId: value.modelId };
}

/**
 * Validate and normalize the backend generation policy at the configuration
 * seam. The parser is intentionally strict: unsupported providers, missing job
 * kinds, extra fields, disabled response healing, and malformed model config all
 * fail loudly instead of being repaired downstream.
 */
export function parseGenerationPolicy(input: unknown): GenerationPolicy {
  if (!isPlainObject(input)) fail('policy must be an object');

  assertExactKeys(input, ['version', 'provider', 'responseHealing', 'jobs'], 'policy');

  if (input.version !== 1) fail('version must be 1');
  if (input.provider !== 'openrouter') fail('provider must be openrouter');

  if (!isPlainObject(input.responseHealing)) fail('responseHealing must be an object');
  assertExactKeys(input.responseHealing, ['enabled'], 'responseHealing');
  if (input.responseHealing.enabled !== true) {
    fail('responseHealing.enabled must be true for policy v1');
  }

  if (!isPlainObject(input.jobs)) fail('jobs must be an object');
  const jobsInput = input.jobs;

  const jobKeys = Object.keys(jobsInput);
  const missingJobs = BACKEND_GENERATION_JOB_KINDS.filter((kind) => !(kind in jobsInput));
  const extraJobs = jobKeys.filter((kind) => !JOB_KIND_SET.has(kind));
  if (missingJobs.length > 0) fail(`jobs missing required kind(s): ${missingJobs.join(', ')}`);
  if (extraJobs.length > 0) fail(`jobs contains unsupported kind(s): ${extraJobs.join(', ')}`);

  const jobs = Object.fromEntries(
    BACKEND_GENERATION_JOB_KINDS.map((kind) => [kind, parseJobPolicy(jobsInput[kind], kind)]),
  ) as Record<BackendGenerationJobKind, GenerationJobPolicy>;

  return {
    version: 1,
    provider: 'openrouter',
    responseHealing: { enabled: true },
    jobs,
  };
}
