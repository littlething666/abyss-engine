import * as THREE from 'three/webgpu';

/** Floats per instance: level, morph, seed, color×3, selectCeremony×2, trialAvailable */
export const CRYSTAL_INSTANCE_STRIDE = 9;

export const CRYSTAL_INSTANCE_OFFSET_LEVEL = 0;
export const CRYSTAL_INSTANCE_OFFSET_MORPH = 1;
export const CRYSTAL_INSTANCE_OFFSET_SEED = 2;
/** 3 floats (rgb) */
export const CRYSTAL_INSTANCE_OFFSET_COLOR = 3;
/** Packed vec2: x = selected (0|1), y = ceremonyPhase (0–1) */
export const CRYSTAL_INSTANCE_OFFSET_SELECT_CEREMONY = 6;
/**
 * 0 = normal, 1 = trial available for the player (questions prepared AND
 * the crystal is XP-capped at the current level band). Drives the
 * sinusoidal pulse VFX in `crystalMaterial.ts`.
 *
 * Source of truth for "available": `isCrystalTrialAvailableForPlayer` in
 * `src/features/crystalTrial/trialPolicy.ts`.
 */
export const CRYSTAL_INSTANCE_OFFSET_TRIAL_AVAILABLE = 8;

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
  instanceTrialAvailable: THREE.InterleavedBufferAttribute;
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
    instanceTrialAvailable: new THREE.InterleavedBufferAttribute(interleaved, 1, CRYSTAL_INSTANCE_OFFSET_TRIAL_AVAILABLE),
  };

  return {
    arrays: { instanceData },
    attributes,
  };
}
