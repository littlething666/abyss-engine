import { describe, expect, it } from 'vitest';
import { WorkflowFail } from '../lib/workflowErrors';
import {
  BACKEND_GENERATION_JOB_KINDS,
  DEFAULT_GENERATION_POLICY,
  generationPolicyHash,
  parseGenerationPolicy,
  resolveGenerationJobPolicy,
  type GenerationPolicy,
} from './index';

function expectConfigInvalid(fn: () => unknown): void {
  expect(fn).toThrow(WorkflowFail);
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(WorkflowFail);
    expect((err as WorkflowFail).code).toBe('config:invalid');
  }
}

function policyWith(overrides: Partial<GenerationPolicy>): GenerationPolicy {
  return {
    ...DEFAULT_GENERATION_POLICY,
    ...overrides,
  } as GenerationPolicy;
}

describe('parseGenerationPolicy', () => {
  it('accepts and normalizes the default backend policy', () => {
    const parsed = parseGenerationPolicy(DEFAULT_GENERATION_POLICY);

    expect(parsed.version).toBe(1);
    expect(parsed.provider).toBe('openrouter');
    expect(parsed.responseHealing).toEqual({ enabled: true });
    expect(Object.keys(parsed.jobs).sort()).toEqual([...BACKEND_GENERATION_JOB_KINDS].sort());
  });

  it('rejects disabled response healing in v1', () => {
    expectConfigInvalid(() =>
      parseGenerationPolicy(policyWith({ responseHealing: { enabled: false } as unknown as { enabled: true } })),
    );
  });

  it('rejects missing job kinds loudly', () => {
    const jobs = { ...DEFAULT_GENERATION_POLICY.jobs };
    delete (jobs as Partial<typeof jobs>)['crystal-trial'];

    expectConfigInvalid(() => parseGenerationPolicy(policyWith({ jobs: jobs as GenerationPolicy['jobs'] })));
  });

  it('rejects unsupported job kinds and extra policy fields', () => {
    expectConfigInvalid(() =>
      parseGenerationPolicy({
        ...DEFAULT_GENERATION_POLICY,
        jobs: { ...DEFAULT_GENERATION_POLICY.jobs, 'made-up-job': { modelId: 'x' } },
      }),
    );

    expectConfigInvalid(() =>
      parseGenerationPolicy({ ...DEFAULT_GENERATION_POLICY, browserOverrideAllowed: true }),
    );
  });

  it('rejects malformed model and temperature entries', () => {
    expectConfigInvalid(() =>
      parseGenerationPolicy({
        ...DEFAULT_GENERATION_POLICY,
        jobs: { ...DEFAULT_GENERATION_POLICY.jobs, 'topic-theory': { modelId: '' } },
      }),
    );

    expectConfigInvalid(() =>
      parseGenerationPolicy({
        ...DEFAULT_GENERATION_POLICY,
        jobs: { ...DEFAULT_GENERATION_POLICY.jobs, 'topic-theory': { modelId: 'x', temperature: 9 } },
      }),
    );
  });
});

describe('resolveGenerationJobPolicy', () => {
  it('resolves every backend job kind with backend-owned healing and policy hash', async () => {
    for (const jobKind of BACKEND_GENERATION_JOB_KINDS) {
      const resolved = await resolveGenerationJobPolicy('00000000-0000-0000-0000-000000000001', jobKind);

      expect(resolved.jobKind).toBe(jobKind);
      expect(resolved.provider).toBe('openrouter');
      expect(resolved.modelId).toBe(DEFAULT_GENERATION_POLICY.jobs[jobKind].modelId);
      expect(resolved.providerHealingRequested).toBe(true);
      expect(resolved.policyVersion).toBe(1);
      expect(resolved.generationPolicyHash).toMatch(/^gpol_[0-9a-f]{64}$/);
    }
  });

  it('changes the policy hash when a backend model policy changes', async () => {
    const original = await generationPolicyHash(DEFAULT_GENERATION_POLICY);
    const changed = await generationPolicyHash({
      ...DEFAULT_GENERATION_POLICY,
      jobs: {
        ...DEFAULT_GENERATION_POLICY.jobs,
        'crystal-trial': { modelId: 'openrouter/anthropic/claude-sonnet-4.5' },
      },
    });

    expect(changed).toMatch(/^gpol_[0-9a-f]{64}$/);
    expect(changed).not.toBe(original);
  });

  it('rejects invalid policy passed to the resolver', async () => {
    await expect(
      resolveGenerationJobPolicy('device-id', 'topic-theory', {
        ...DEFAULT_GENERATION_POLICY,
        responseHealing: { enabled: false } as unknown as { enabled: true },
      }),
    ).rejects.toMatchObject({ name: 'WorkflowFail', code: 'config:invalid' });
  });
});
