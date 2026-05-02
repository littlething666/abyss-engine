import { describe, expect, it } from 'vitest';
import {
  createCrystalInstancedAttributes,
  CRYSTAL_INSTANCE_OFFSET_TOPIC_SEED,
  CRYSTAL_INSTANCE_OFFSET_TRIAL_AVAILABLE,
  CRYSTAL_INSTANCE_STRIDE,
} from './crystalInstanceAttributes';

describe('createCrystalInstancedAttributes', () => {
  it('uses one InstancedInterleavedBuffer for all instance attributes (WebGPU max 8 vertex buffers)', () => {
    const { attributes } = createCrystalInstancedAttributes(4);
    expect(attributes.interleaved).toBe(attributes.instanceLevel.data);
    expect(attributes.interleaved).toBe(attributes.instanceMorphProgress.data);
    expect(attributes.interleaved).toBe(attributes.instanceSubjectSeed.data);
    expect(attributes.interleaved).toBe(attributes.instanceColor.data);
    expect(attributes.interleaved).toBe(attributes.instanceSelectCeremony.data);
    expect(attributes.interleaved).toBe(attributes.instanceTrialAvailable.data);
    expect(attributes.interleaved).toBe(attributes.instanceTopicSeed.data);
  });

  it('packs trial-available before topic-seed without overlap', () => {
    expect(CRYSTAL_INSTANCE_OFFSET_TRIAL_AVAILABLE + 1).toBe(CRYSTAL_INSTANCE_OFFSET_TOPIC_SEED);
  });

  it('packs topic-seed as the final lane in the stride', () => {
    expect(CRYSTAL_INSTANCE_OFFSET_TOPIC_SEED + 1).toBe(CRYSTAL_INSTANCE_STRIDE);
    expect(CRYSTAL_INSTANCE_STRIDE).toBe(10);
  });
});
