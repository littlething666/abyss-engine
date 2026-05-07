import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATION_POLICY } from './defaultPolicy';
import { bindBackendGenerationPolicyToSnapshot } from './snapshotBinding';
import type { GenerationPolicy } from './types';

const baseSnapshot = {
  snapshot_version: 1,
  pipeline_kind: 'topic-theory',
  schema_version: 1,
  prompt_template_version: 'pt:v1',
  model_id: 'client/forbidden-model',
  subject_id: 'physics',
  topic_id: 'motion',
};

describe('bindBackendGenerationPolicyToSnapshot', () => {
  it('overwrites client model fields with backend-resolved policy fields before hashing/storage', async () => {
    const policy: GenerationPolicy = {
      ...DEFAULT_GENERATION_POLICY,
      jobs: {
        ...DEFAULT_GENERATION_POLICY.jobs,
        'topic-theory': { modelId: 'openrouter/backend/topic-theory' },
      },
    };

    const bound = await bindBackendGenerationPolicyToSnapshot('dev-1', baseSnapshot, policy);

    expect(bound).toMatchObject({
      model_id: 'openrouter/backend/topic-theory',
      provider_healing_requested: true,
    });
    expect(bound.generation_policy_hash).toMatch(/^gpol_[a-f0-9]{64}$/);
  });

  it('fails loudly when a snapshot pipeline kind is outside the backend policy seam', async () => {
    await expect(
      bindBackendGenerationPolicyToSnapshot('dev-1', {
        ...baseSnapshot,
        pipeline_kind: 'frontend-only-kind',
      }),
    ).rejects.toThrow('unsupported backend generation job kind in snapshot.pipeline_kind: frontend-only-kind');
  });
});
