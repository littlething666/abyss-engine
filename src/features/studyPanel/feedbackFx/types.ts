/**
 * Rating feedback visual effect types.
 *
 * Tier mapping:
 *   1 (Forgot)  → MistShudder
 *   2 (Hard)    → EmberSparks
 *   3 (Good)    → ArcaneSparkles
 *   4 (Perfect) → RuneCircle
 */

export type FeedbackTier = 1 | 2 | 3 | 4;

export interface Particle {
  /** Whether this slot is currently in use. */
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Remaining lifetime in seconds. */
  life: number;
  /** Total lifetime at spawn (seconds). */
  maxLife: number;
  /** Base radius in CSS pixels. */
  radius: number;
  /** RGBA colour components 0-255 / 0-1 for alpha. */
  r: number;
  g: number;
  b: number;
  alpha: number;
  /** Per-particle rotation in radians (used by star shapes). */
  rotation: number;
  /** Rotation speed rad/s. */
  rotationSpeed: number;
  /** Canvas shadowBlur value for glow. */
  glow: number;
}

/** Custom draw callback — receives the canvas context and the particle to render. */
export type ParticleDrawFn = (
  ctx: CanvasRenderingContext2D,
  p: Particle,
  progress: number,
) => void;

export interface ParticleEffect {
  /** Unique key to prevent duplicate triggers. */
  id: string;
  /** All particles owned by this effect. */
  particles: Particle[];
  /** Elapsed time in seconds since effect start. */
  elapsed: number;
  /** Hard max duration — effect is killed after this. */
  duration: number;
  /** Per-frame update. Return `false` to kill the effect early. */
  update: (dt: number, effect: ParticleEffect) => boolean;
  /** Per-particle draw override (optional, falls back to circle). */
  draw?: ParticleDrawFn;
  /** Optional post-draw hook for full-canvas overlays (vignette, radial flash). */
  postDraw?: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    effect: ParticleEffect,
  ) => void;
}

export interface EffectConfig {
  tier: FeedbackTier;
  /** Bounding rect of the card element, relative to the canvas. */
  cardRect: { x: number; y: number; width: number; height: number };
  /** Canvas logical size. */
  canvasWidth: number;
  canvasHeight: number;
}
