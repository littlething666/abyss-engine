import { describe, expect, it } from 'vitest';
import {
  createCrystalInstancedAttributes,
  CRYSTAL_INSTANCE_OFFSET_TRIAL_READY,
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
    expect(attributes.interleaved).toBe(attributes.instanceTrialReady.data);
  });

  it('packs trial after color and ceremony without overlapping stride', () => {
    expect(CRYSTAL_INSTANCE_OFFSET_TRIAL_READY + 1).toBe(CRYSTAL_INSTANCE_STRIDE);
  });
});
