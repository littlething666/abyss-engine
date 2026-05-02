import {
  CRYSTAL_XP_PER_LEVEL,
  MAX_CRYSTAL_LEVEL,
  calculateLevelFromXP,
} from '../progressionUtils';

/**
 * Pure visualization model: maps crystal level + morph animation progress to GPU-friendly parameters.
 * Tier tables match `plans/crystal-procedural-morph-plan.md`.
 *
 * Seed derivation (`subjectSeedFromId`, `topicSeedFromRef`) lives in `./seeds`,
 * not here — keeping morph/tier blending decoupled from per-instance seed math.
 */

export interface CrystalDisplacementParams {
  lowFreqAmplitude: number;
  lowFreqScale: number;
  highFreqAmplitude: number;
  highFreqScale: number;
  quantizationStep: number;
  spikeAmplitude: number;
  spikeScale: number;
  morphEnvelope: number;
}

export interface CrystalMaterialParams {
  transmissionFactor: number;
  ior: number;
  thickness: number;
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
  dispersion: number;
  fresnelPower: number;
  fresnelIntensity: number;
}

export interface CrystalMorphParams {
  displacement: CrystalDisplacementParams;
  material: CrystalMaterialParams;
  /** 0–1 progress within the current level band (for subtle intra-level variation). */
  levelBandProgress: number;
  /** Discrete level 0–MAX_CRYSTAL_LEVEL */
  level: number;
}

const DISPLACEMENT_TIERS: CrystalDisplacementParams[] = [
  { lowFreqAmplitude: 0.0, lowFreqScale: 0.0, highFreqAmplitude: 0.0, highFreqScale: 0.0, quantizationStep: 0.0, spikeAmplitude: 0.0, spikeScale: 0.0, morphEnvelope: 1 },
  { lowFreqAmplitude: 0.06, lowFreqScale: 1.8, highFreqAmplitude: 0.02, highFreqScale: 3.0, quantizationStep: 0.0, spikeAmplitude: 0.01, spikeScale: 2.0, morphEnvelope: 1 },
  { lowFreqAmplitude: 0.12, lowFreqScale: 2.2, highFreqAmplitude: 0.06, highFreqScale: 4.0, quantizationStep: 0.15, spikeAmplitude: 0.04, spikeScale: 3.0, morphEnvelope: 1 },
  { lowFreqAmplitude: 0.10, lowFreqScale: 1.5, highFreqAmplitude: 0.14, highFreqScale: 5.5, quantizationStep: 0.28, spikeAmplitude: 0.10, spikeScale: 4.0, morphEnvelope: 1 },
  { lowFreqAmplitude: 0.08, lowFreqScale: 1.2, highFreqAmplitude: 0.22, highFreqScale: 7.0, quantizationStep: 0.38, spikeAmplitude: 0.18, spikeScale: 5.5, morphEnvelope: 1 },
  { lowFreqAmplitude: 0.05, lowFreqScale: 1.0, highFreqAmplitude: 0.32, highFreqScale: 9.0, quantizationStep: 0.50, spikeAmplitude: 0.28, spikeScale: 7.0, morphEnvelope: 1 },
];

const MATERIAL_TIERS: CrystalMaterialParams[] = [
  { transmissionFactor: 0.0, ior: 1.0, thickness: 0.0, roughness: 0.95, metalness: 0.0, emissiveIntensity: 0.1, dispersion: 0.0, fresnelPower: 5.0, fresnelIntensity: 0.05 },
  { transmissionFactor: 0.05, ior: 1.1, thickness: 0.1, roughness: 0.75, metalness: 0.0, emissiveIntensity: 0.3, dispersion: 0.0, fresnelPower: 4.0, fresnelIntensity: 0.15 },
  { transmissionFactor: 0.25, ior: 1.2, thickness: 0.2, roughness: 0.55, metalness: 0.0, emissiveIntensity: 0.5, dispersion: 0.0, fresnelPower: 3.5, fresnelIntensity: 0.3 },
  { transmissionFactor: 0.5, ior: 1.3, thickness: 0.3, roughness: 0.35, metalness: 0.0, emissiveIntensity: 0.8, dispersion: 0.02, fresnelPower: 3.0, fresnelIntensity: 0.5 },
  { transmissionFactor: 0.75, ior: 1.4, thickness: 0.4, roughness: 0.15, metalness: 0.0, emissiveIntensity: 1.2, dispersion: 0.05, fresnelPower: 2.5, fresnelIntensity: 0.7 },
  { transmissionFactor: 0.92, ior: 1.5, thickness: 0.5, roughness: 0.05, metalness: 0.0, emissiveIntensity: 2.0, dispersion: 0.1, fresnelPower: 2.0, fresnelIntensity: 1.0 },
];

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** Smoothstep-style ease for ceremony / morph curves. */
export function ceremonialEase(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function blendDisplacement(a: CrystalDisplacementParams, b: CrystalDisplacementParams, t: number): CrystalDisplacementParams {
  const u = ceremonialEase(t);
  return {
    lowFreqAmplitude: lerp(a.lowFreqAmplitude, b.lowFreqAmplitude, u),
    lowFreqScale: lerp(a.lowFreqScale, b.lowFreqScale, u),
    highFreqAmplitude: lerp(a.highFreqAmplitude, b.highFreqAmplitude, u),
    highFreqScale: lerp(a.highFreqScale, b.highFreqScale, u),
    quantizationStep: lerp(a.quantizationStep, b.quantizationStep, u),
    spikeAmplitude: lerp(a.spikeAmplitude, b.spikeAmplitude, u),
    spikeScale: lerp(a.spikeScale, b.spikeScale, u),
    morphEnvelope: lerp(a.morphEnvelope, b.morphEnvelope, u),
  };
}

function blendMaterial(a: CrystalMaterialParams, b: CrystalMaterialParams, t: number): CrystalMaterialParams {
  const u = ceremonialEase(t);
  return {
    transmissionFactor: lerp(a.transmissionFactor, b.transmissionFactor, u),
    ior: lerp(a.ior, b.ior, u),
    thickness: lerp(a.thickness, b.thickness, u),
    roughness: lerp(a.roughness, b.roughness, u),
    metalness: lerp(a.metalness, b.metalness, u),
    emissiveIntensity: lerp(a.emissiveIntensity, b.emissiveIntensity, u),
    dispersion: lerp(a.dispersion, b.dispersion, u),
    fresnelPower: lerp(a.fresnelPower, b.fresnelPower, u),
    fresnelIntensity: lerp(a.fresnelIntensity, b.fresnelIntensity, u),
  };
}

/**
 * @param level — discrete crystal level (0–5)
 * @param morphProgress — 0 = at previous tier, 1 = settled at `level` tier (used during level-up ceremony)
 */
export function getDisplacementParams(level: number, morphProgress: number): CrystalDisplacementParams {
  const L = Math.min(MAX_CRYSTAL_LEVEL, Math.max(0, Math.floor(level)));
  const fromTier = Math.max(0, L - 1);
  const toTier = L;
  const t = clamp01(morphProgress);
  return blendDisplacement(DISPLACEMENT_TIERS[fromTier], DISPLACEMENT_TIERS[toTier], t);
}

export function getMaterialParams(level: number, morphProgress: number): CrystalMaterialParams {
  const L = Math.min(MAX_CRYSTAL_LEVEL, Math.max(0, Math.floor(level)));
  const fromTier = Math.max(0, L - 1);
  const toTier = L;
  const t = clamp01(morphProgress);
  return blendMaterial(MATERIAL_TIERS[fromTier], MATERIAL_TIERS[toTier], t);
}

/** XP progress within the current level band (0–1), or 1 when at max level. */
export function getLevelBandProgress(xp: number): number {
  const safeXp = Math.max(0, xp);
  const level = calculateLevelFromXP(safeXp);
  if (level >= MAX_CRYSTAL_LEVEL) {
    return 1;
  }
  const xpIntoLevel = safeXp - level * CRYSTAL_XP_PER_LEVEL;
  return xpIntoLevel / CRYSTAL_XP_PER_LEVEL;
}

/**
 * Full morph snapshot for one crystal instance (CPU-side mirror; shader uses same tier blending via level + morphProgress).
 */
export function getCrystalMorphParams(
  xp: number,
  morphProgress: number,
): CrystalMorphParams {
  const level = calculateLevelFromXP(xp);
  return {
    level,
    levelBandProgress: getLevelBandProgress(xp),
    displacement: getDisplacementParams(level, morphProgress),
    material: getMaterialParams(level, morphProgress),
  };
}
