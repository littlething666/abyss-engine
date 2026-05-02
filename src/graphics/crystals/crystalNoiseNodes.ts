// @ts-nocheck — three/tsl `Fn` overload + interleaved TSL chains; same escape hatch as `crystalMaterial.ts`.
import { abs, Fn, float, fract, max, sin, vec3, triNoise3D } from 'three/tsl';

/**
 * Organic low-frequency displacement (levels 1–2 emphasis).
 *
 * Takes a single combined `seed` argument; the caller is responsible for
 * mixing subject + topic seeds before invoking. Keeping the arity at 3
 * matches what TSL's array-destructure Fn pattern reliably forwards in this
 * three.js version (4-arg destructures saw the trailing arg resolve to null
 * inside generated WGSL).
 */
export const crystalLowFrequencyNoise = Fn(([position, seed, freqScale]) => {
  const s = float(seed);
  const p = vec3(position).mul(freqScale).add(vec3(s, s.mul(1.713), s.mul(0.291)));
  return triNoise3D(p, float(1), float(0));
});

/**
 * Faceted high-frequency displacement (levels 3–5); tri-noise stands in for cellular Voronoi for cost.
 */
export const crystalHighFrequencyNoise = Fn(([position, seed, freqScale]) => {
  const s = float(seed);
  const p = vec3(position).mul(freqScale).add(vec3(s.mul(2.17), s, s.mul(3.09)));
  return triNoise3D(p, float(2.1), float(0));
});

/**
 * Outward-only spike displacement — rectified noise that only pushes vertices away from center.
 * Creates sharp protrusions reminiscent of mineral spikes.
 */
export const crystalSpikeNoise = Fn(([position, seed, freqScale]) => {
  const s = float(seed);
  const p = vec3(position).mul(freqScale).add(vec3(s.mul(3.41), s.mul(0.73), s.mul(2.19)));
  const raw = triNoise3D(p, float(3.5), float(0));
  return max(raw, float(0)).mul(abs(raw).pow(0.6));
});

/**
 * Centralized per-shard rotation jitter seed.
 *
 * Single source of truth for the `7.913` constant used by per-shard jitter;
 * never copy this expression elsewhere. Returns a deterministic [0, 1)
 * value that varies independently across shards and topics. Implemented as
 * `fract(sin(shardIdx + topicSeed * 7.913) * 43758.5453)` — a cheap
 * branchless TSL hash.
 */
export const crystalShardJitterSeed = Fn(([iTopicSeed, shardIdx]) => {
  const hashInput = float(shardIdx).add(float(iTopicSeed).mul(7.913));
  return fract(sin(hashInput).mul(43758.5453));
});
