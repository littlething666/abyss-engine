// @ts-nocheck — three/tsl `Fn` overload + interleaved TSL chains; same escape hatch as `crystalMaterial.ts`.
import { abs, Fn, float, fract, max, sin, vec3, triNoise3D } from 'three/tsl';

/**
 * Combined noise seed: equally weights subject + topic seed channels so
 * every topic has its own unique noise variation, while still inheriting
 * a subject-coherent character.
 */
const combineSeeds = Fn(([subjectSeed, topicSeed]) => {
  return float(subjectSeed).mul(0.5).add(float(topicSeed).mul(0.5));
});

/**
 * Organic low-frequency displacement (levels 1–2 emphasis).
 */
export const crystalLowFrequencyNoise = Fn(
  ([position, subjectSeed, topicSeed, freqScale]) => {
    const seed = combineSeeds(subjectSeed, topicSeed);
    const p = vec3(position).mul(freqScale).add(vec3(seed, seed.mul(1.713), seed.mul(0.291)));
    return triNoise3D(p, float(1), float(0));
  },
);

/**
 * Faceted high-frequency displacement (levels 3–5); tri-noise stands in for cellular Voronoi for cost.
 */
export const crystalHighFrequencyNoise = Fn(
  ([position, subjectSeed, topicSeed, freqScale]) => {
    const seed = combineSeeds(subjectSeed, topicSeed);
    const p = vec3(position).mul(freqScale).add(vec3(seed.mul(2.17), seed, seed.mul(3.09)));
    return triNoise3D(p, float(2.1), float(0));
  },
);

/**
 * Outward-only spike displacement — rectified noise that only pushes vertices away from center.
 * Creates sharp protrusions reminiscent of mineral spikes.
 */
export const crystalSpikeNoise = Fn(
  ([position, subjectSeed, topicSeed, freqScale]) => {
    const seed = combineSeeds(subjectSeed, topicSeed);
    const p = vec3(position).mul(freqScale).add(vec3(seed.mul(3.41), seed.mul(0.73), seed.mul(2.19)));
    const raw = triNoise3D(p, float(3.5), float(0));
    return max(raw, float(0)).mul(abs(raw).pow(0.6));
  },
);

/**
 * Centralized per-shard rotation jitter seed.
 *
 * Single source of truth for the `7.913` constant used by the per-shard
 * jitter at L4–L5; never copy this expression elsewhere. Returns a
 * deterministic [0, 1) value that varies independently across shards and
 * topics. Implemented as `fract(sin(shardIdx + topicSeed * 7.913) * 43758.5453)`
 * — a cheap branchless TSL hash that mirrors common shader-side hashes.
 */
export const crystalShardJitterSeed = Fn(
  ([iTopicSeed, shardIdx]) => {
    const hashInput = float(shardIdx).add(float(iTopicSeed).mul(7.913));
    return fract(sin(hashInput).mul(43758.5453));
  },
);
