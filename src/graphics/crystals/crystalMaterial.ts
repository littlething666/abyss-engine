// @ts-nocheck — three/tsl instanced buffer helpers are typed as generic nodes; graphs are valid at runtime.
import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  float,
  floor,
  Fn,
  instancedDynamicBufferAttribute,
  max,
  mix,
  normalLocal,
  normalWorld,
  positionLocal,
  positionWorld,
  sin,
  time,
  uv,
  vec3,
} from 'three/tsl';
import {
  CRYSTAL_INSTANCE_OFFSET_COLOR,
  CRYSTAL_INSTANCE_OFFSET_LEVEL,
  CRYSTAL_INSTANCE_OFFSET_MORPH,
  CRYSTAL_INSTANCE_OFFSET_SELECT_CEREMONY,
  CRYSTAL_INSTANCE_OFFSET_SEED,
  CRYSTAL_INSTANCE_OFFSET_TOPIC_SEED,
  CRYSTAL_INSTANCE_OFFSET_TRIAL_AVAILABLE,
  CRYSTAL_INSTANCE_STRIDE,
  type CrystalInstancedAttributes,
} from './crystalInstanceAttributes';
import {
  crystalHighFrequencyNoise,
  crystalLowFrequencyNoise,
  crystalSpikeNoise,
} from './crystalNoiseNodes';

const stoneColor = vec3(0.541, 0.541, 0.478);

/**
 * Picks one of six tier scalars using a float index 0–5 (piecewise constant).
 */
function tierScalar(
  tierIndex: {
    lessThan: (v: number) => { select: (a: unknown, b: unknown) => unknown };
  },
  v0: number,
  v1: number,
  v2: number,
  v3: number,
  v4: number,
  v5: number,
) {
  const f = float;
  return tierIndex
    .lessThan(0.5)
    .select(
      f(v0),
      tierIndex
        .lessThan(1.5)
        .select(
          f(v1),
          tierIndex
            .lessThan(2.5)
            .select(
              f(v2),
              tierIndex
                .lessThan(3.5)
                .select(f(v3), tierIndex.lessThan(4.5).select(f(v4), f(v5))),
            ),
        ),
    );
}

/**
 * Shard activation: returns 1.0 when the shard should be visible at the given tier, 0.0 otherwise.
 * One shard emerges per level — shard `k` activates at `tier >= k`. Mirrors the
 * `SHARD_ACTIVATION_LEVELS = [0,1,2,3,4,5]` table on the CPU side. Implemented
 * as a branchless piecewise ladder over `shardIdx` so we never compare two
 * TSL nodes via `greaterThanEqual` (some TSL versions reject node-vs-node).
 */
function shardActiveAtTier(shardIdx: unknown, tier: unknown) {
  const s = shardIdx as any;
  const t = tier as any;
  return s
    .lessThan(0.5)
    .select(
      float(1),
      s
        .lessThan(1.5)
        .select(
          t.greaterThanEqual(1).select(float(1), float(0)),
          s
            .lessThan(2.5)
            .select(
              t.greaterThanEqual(2).select(float(1), float(0)),
              s
                .lessThan(3.5)
                .select(
                  t.greaterThanEqual(3).select(float(1), float(0)),
                  s
                    .lessThan(4.5)
                    .select(
                      t.greaterThanEqual(4).select(float(1), float(0)),
                      t.greaterThanEqual(5).select(float(1), float(0)),
                    ),
                ),
            ),
        ),
    );
}

/**
 * Shared MeshPhysicalNodeMaterial for instanced procedural crystals.
 * Reads shard index from UV.x (encoded in cluster geometry) to collapse inactive shards.
 * Tier tables mirror `crystalMorphModel.ts` / morph plan.
 */
export function createCrystalNodeMaterial(
  attributes: CrystalInstancedAttributes,
  envMap: THREE.Texture | null,
): THREE.MeshPhysicalNodeMaterial {
  const ib = attributes.interleaved;
  const S = CRYSTAL_INSTANCE_STRIDE;
  const iLevel = instancedDynamicBufferAttribute(ib, 'float', S, CRYSTAL_INSTANCE_OFFSET_LEVEL).setInstanced(true);
  const iMorph = instancedDynamicBufferAttribute(ib, 'float', S, CRYSTAL_INSTANCE_OFFSET_MORPH).setInstanced(true);
  const iSubjectSeed = instancedDynamicBufferAttribute(ib, 'float', S, CRYSTAL_INSTANCE_OFFSET_SEED).setInstanced(true);
  const iColor = instancedDynamicBufferAttribute(ib, 'vec3', S, CRYSTAL_INSTANCE_OFFSET_COLOR).setInstanced(true);
  const iSelectCeremony = instancedDynamicBufferAttribute(ib, 'vec2', S, CRYSTAL_INSTANCE_OFFSET_SELECT_CEREMONY).setInstanced(true);
  const iTrialAvailable = instancedDynamicBufferAttribute(ib, 'float', S, CRYSTAL_INSTANCE_OFFSET_TRIAL_AVAILABLE).setInstanced(true);
  const iTopicSeed = instancedDynamicBufferAttribute(ib, 'float', S, CRYSTAL_INSTANCE_OFFSET_TOPIC_SEED).setInstanced(true);
  const iSelected = iSelectCeremony.x;
  const iCeremonyPhase = iSelectCeremony.y;

  const shardIdx = uv().x;

  const levelInt = clamp(floor(iLevel), float(0), float(5));
  const fromTier = max(float(0), levelInt.sub(1));
  const morphT = iMorph.mul(iMorph).mul(float(3).sub(iMorph.mul(2)));

  const fromActive = shardActiveAtTier(shardIdx, fromTier);
  const toActive = shardActiveAtTier(shardIdx, levelInt);
  const shardVisibility = mix(fromActive, toActive, morphT);

  const lowFreqAmp = mix(
    tierScalar(fromTier, 0, 0.06, 0.12, 0.10, 0.08, 0.05),
    tierScalar(levelInt, 0, 0.06, 0.12, 0.10, 0.08, 0.05),
    morphT,
  );
  const lowFreqScale = mix(
    tierScalar(fromTier, 0, 1.8, 2.2, 1.5, 1.2, 1.0),
    tierScalar(levelInt, 0, 1.8, 2.2, 1.5, 1.2, 1.0),
    morphT,
  );
  const highFreqAmp = mix(
    tierScalar(fromTier, 0, 0.02, 0.06, 0.14, 0.22, 0.32),
    tierScalar(levelInt, 0, 0.02, 0.06, 0.14, 0.22, 0.32),
    morphT,
  );
  const highFreqScale = mix(
    tierScalar(fromTier, 0, 3.0, 4.0, 5.5, 7.0, 9.0),
    tierScalar(levelInt, 0, 3.0, 4.0, 5.5, 7.0, 9.0),
    morphT,
  );
  const quantStep = mix(
    tierScalar(fromTier, 0, 0, 0.15, 0.28, 0.38, 0.50),
    tierScalar(levelInt, 0, 0, 0.15, 0.28, 0.38, 0.50),
    morphT,
  );
  const spikeAmpBase = mix(
    tierScalar(fromTier, 0, 0.01, 0.04, 0.10, 0.18, 0.28),
    tierScalar(levelInt, 0, 0.01, 0.04, 0.10, 0.18, 0.28),
    morphT,
  );
  // L5 capstone: branchless +0.05 spike-amplitude bump at max tier.
  const spikeAmp = spikeAmpBase.add(
    levelInt.greaterThanEqual(5).select(float(0.05), float(0)),
  );
  const spikeScale = mix(
    tierScalar(fromTier, 0, 2.0, 3.0, 4.0, 5.5, 7.0),
    tierScalar(levelInt, 0, 2.0, 3.0, 4.0, 5.5, 7.0),
    morphT,
  );

  const levelNorm = clamp(iLevel, float(0), float(5)).div(float(5));

  const roughness = mix(
    tierScalar(fromTier, 0.95, 0.75, 0.55, 0.35, 0.15, 0.05),
    tierScalar(levelInt, 0.95, 0.75, 0.55, 0.35, 0.15, 0.05),
    morphT,
  );
  const transmission = mix(
    tierScalar(fromTier, 0, 0.05, 0.25, 0.5, 0.75, 0.92),
    tierScalar(levelInt, 0, 0.05, 0.25, 0.5, 0.75, 0.92),
    morphT,
  );
  const ior = mix(
    tierScalar(fromTier, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5),
    tierScalar(levelInt, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5),
    morphT,
  );
  const thickness = mix(
    tierScalar(fromTier, 0, 0.1, 0.2, 0.3, 0.4, 0.5),
    tierScalar(levelInt, 0, 0.1, 0.2, 0.3, 0.4, 0.5),
    morphT,
  );
  const emissiveIntensity = mix(
    tierScalar(fromTier, 0.1, 0.3, 0.5, 0.8, 1.2, 2.0),
    tierScalar(levelInt, 0.1, 0.3, 0.5, 0.8, 1.2, 2.0),
    morphT,
  );
  const dispersion = mix(
    tierScalar(fromTier, 0, 0, 0, 0.02, 0.05, 0.1),
    tierScalar(levelInt, 0, 0, 0, 0.02, 0.05, 0.1),
    morphT,
  );
  const fresnelPower = mix(
    tierScalar(fromTier, 5.0, 4.0, 3.5, 3.0, 2.5, 2.0),
    tierScalar(levelInt, 5.0, 4.0, 3.5, 3.0, 2.5, 2.0),
    morphT,
  );
  const fresnelIntensity = mix(
    tierScalar(fromTier, 0.05, 0.15, 0.3, 0.5, 0.7, 1.0),
    tierScalar(levelInt, 0.05, 0.15, 0.3, 0.5, 0.7, 1.0),
    morphT,
  );

  const material = new THREE.MeshPhysicalNodeMaterial({
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: true,
    envMap,
    envMapIntensity: 1.2,
  });

  const positionNode = Fn(() => {
    const n = normalLocal.normalize();
    const p = positionLocal;
    const subjectSeed = iSubjectSeed;
    const topicSeed = iTopicSeed;

    // Per-topic noise variation: each Fn now takes both seeds and combines
    // them inside, giving every topic its own unique displacement pattern.
    const lowNoise = crystalLowFrequencyNoise(p, subjectSeed, topicSeed, lowFreqScale);
    const highRaw = crystalHighFrequencyNoise(p, subjectSeed, topicSeed, highFreqScale);
    const highQuant = floor(highRaw.div(max(quantStep, float(1e-4)))).mul(quantStep);
    const spike = crystalSpikeNoise(p, subjectSeed, topicSeed, spikeScale);
    const total = lowNoise.mul(lowFreqAmp)
      .add(highQuant.mul(highFreqAmp))
      .add(spike.mul(spikeAmp));

    const displaced = positionLocal.add(n.mul(total));
    return displaced.mul(shardVisibility);
  })();

  material.positionNode = positionNode;

  material.colorNode = mix(stoneColor, iColor, levelNorm);
  material.roughnessNode = roughness;
  material.metalnessNode = float(0);
  material.transmissionNode = transmission;
  material.iorNode = ior;
  material.thicknessNode = thickness;
  material.dispersionNode = dispersion;

  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const fresnelRaw = float(1)
    .sub(normalWorld.dot(viewDir).saturate())
    .pow(fresnelPower);
  const fresnelTerm = fresnelRaw.mul(fresnelIntensity);
  const ceremonyFlash = float(iCeremonyPhase).mul(float(1).sub(float(iCeremonyPhase))).mul(8.0);
  const selectionBoost = iSelected.mul(1.5);

  // Crystal Trial: slow sinusoidal pulse when the trial is available for the
  // player (distinct from ceremony flash). Frequency ~1.5 Hz, amplitude 0.8,
  // biased to always be slightly glowing.
  const trialPulseRaw = sin(time.mul(float(9.42))).mul(float(0.4)).add(float(0.6));
  const trialPulse = iTrialAvailable.mul(trialPulseRaw).mul(float(0.8));

  material.emissiveNode = iColor.mul(
    fresnelTerm.add(levelNorm.mul(0.3)).add(selectionBoost).add(ceremonyFlash).add(trialPulse).add(emissiveIntensity.mul(0.15)),
  );

  return material;
}
