import * as THREE from 'three/webgpu';

/** Floats per instance: level, morph, seed, color×3, selectCeremony×2, trialReady */
export const CRYSTAL_INSTANCE_STRIDE = 9;

export const CRYSTAL_INSTANCE_OFFSET_LEVEL = 0;
export const CRYSTAL_INSTANCE_OFFSET_MORPH = 1;
export const CRYSTAL_INSTANCE_OFFSET_SEED = 2;
/** 3 floats (rgb) */
export const CRYSTAL_INSTANCE_OFFSET_COLOR = 3;
/** Packed vec2: x = selected (0|1), y = ceremonyPhase (0–1) */
export const CRYSTAL_INSTANCE_OFFSET_SELECT_CEREMONY = 6;
/** 0 = normal, 1 = trial ready (drives sinusoidal pulse VFX) */
export const CRYSTAL_INSTANCE_OFFSET_TRIAL_READY = 8;

export const CRYSTAL_INSTANCE_FLOAT_COUNT = CRYSTAL_INSTANCE_STRIDE;

export const CRYSTAL_MAX_INSTANCES = 64;

export interface CrystalInstanceArrays {
  /** Packed rows: `maxInstances * CRYSTAL_INSTANCE_STRIDE` floats */
  instanceData: Float32Array;
}

export interface CrystalInstancedAttributes {
  interleaved: THREE.InstancedInterleavedBuffer;
  instanceLevel: THREE.InterleavedBufferAttribute;
  instanceMorphProgress: THREE.InterleavedBufferAttribute;
  instanceSubjectSeed: THREE.InterleavedBufferAttribute;
  instanceColor: THREE.InterleavedBufferAttribute;
  instanceSelectCeremony: THREE.InterleavedBufferAttribute;
  instanceTrialReady: THREE.InterleavedBufferAttribute;
}

export function createCrystalInstancedAttributes(
  maxInstances: number = CRYSTAL_MAX_INSTANCES,
): { arrays: CrystalInstanceArrays; attributes: CrystalInstancedAttributes } {
  const instanceData = new Float32Array(maxInstances * CRYSTAL_INSTANCE_STRIDE);
  const interleaved = new THREE.InstancedInterleavedBuffer(instanceData, CRYSTAL_INSTANCE_STRIDE, 1);
  interleaved.setUsage(THREE.DynamicDrawUsage);

  const attributes: CrystalInstancedAttributes = {
    interleaved,
    instanceLevel: new THREE.InterleavedBufferAttribute(interleaved, 1, CRYSTAL_INSTANCE_OFFSET_LEVEL),
    instanceMorphProgress: new THREE.InterleavedBufferAttribute(interleaved, 1, CRYSTAL_INSTANCE_OFFSET_MORPH),
    instanceSubjectSeed: new THREE.InterleavedBufferAttribute(interleaved, 1, CRYSTAL_INSTANCE_OFFSET_SEED),
    instanceColor: new THREE.InterleavedBufferAttribute(interleaved, 3, CRYSTAL_INSTANCE_OFFSET_COLOR),
    instanceSelectCeremony: new THREE.InterleavedBufferAttribute(interleaved, 2, CRYSTAL_INSTANCE_OFFSET_SELECT_CEREMONY),
    instanceTrialReady: new THREE.InterleavedBufferAttribute(interleaved, 1, CRYSTAL_INSTANCE_OFFSET_TRIAL_READY),
  };

  return {
    arrays: { instanceData },
    attributes,
  };
}
