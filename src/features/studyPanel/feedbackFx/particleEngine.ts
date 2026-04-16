import type { Particle, ParticleEffect } from './types';

const POOL_SIZE = 200;

export function createParticlePool(): Particle[] {
  return Array.from({ length: POOL_SIZE }, () => createDeadParticle());
}

export function createDeadParticle(): Particle {
  return {
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0,
    radius: 2,
    r: 255,
    g: 255,
    b: 255,
    alpha: 1,
    rotation: 0,
    rotationSpeed: 0,
    glow: 0,
  };
}

export function spawnParticle(
  pool: Particle[],
  overrides: Partial<Particle>,
): Particle | null {
  const slot = pool.find((p) => !p.alive);
  if (!slot) return null;
  Object.assign(slot, createDeadParticle(), overrides, { alive: true });
  return slot;
}

export function updateParticles(pool: Particle[], dt: number): void {
  for (const p of pool) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.alive = false;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.rotationSpeed * dt;
  }
}

function drawCircleParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  progress: number,
): void {
  const fadeAlpha = p.alpha * Math.min(1, p.life / Math.max(p.maxLife * 0.3, 0.05));
  if (fadeAlpha <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  if (p.glow > 0) {
    ctx.shadowBlur = p.glow;
    ctx.shadowColor = `rgba(${p.r},${p.g},${p.b},${fadeAlpha})`;
  }
  ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${fadeAlpha})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  pool: Particle[],
  drawFn?: (ctx: CanvasRenderingContext2D, p: Particle, progress: number) => void,
  progress: number = 0,
): void {
  for (const p of pool) {
    if (!p.alive) continue;
    if (drawFn) {
      drawFn(ctx, p, progress);
    } else {
      drawCircleParticle(ctx, p, progress);
    }
  }
}

export function killAllParticles(pool: Particle[]): void {
  for (const p of pool) {
    p.alive = false;
  }
}

export function hasAliveParticles(pool: Particle[]): boolean {
  return pool.some((p) => p.alive);
}

/** Data attribute used to store the capped DPR on the canvas element. */
export const CANVAS_DPR_ATTR = 'data-dpr';

/**
 * Run the main canvas loop for a set of active effects.
 * Returns a dispose function that stops the loop.
 */
export function runEffectLoop(
  canvas: HTMLCanvasElement,
  getEffects: () => ParticleEffect[],
  onAllDone: () => void,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let lastTime = performance.now();
  let rafId = 0;
  let disposed = false;

  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
    lastTime = now;

    const effects = getEffects();
    if (effects.length === 0) {
      onAllDone();
      return;
    }

    ctx!.clearRect(0, 0, canvas.width, canvas.height);

    // Read the capped DPR stored by RatingFeedbackCanvas (avoids mismatch
    // with the uncapped window.devicePixelRatio on DPR > 2 devices).
    const dpr = parseFloat(canvas.getAttribute(CANVAS_DPR_ATTR) || '1') || 1;
    const logicalW = canvas.width / dpr;
    const logicalH = canvas.height / dpr;

    for (const effect of effects) {
      effect.elapsed += dt;
      const alive = effect.update(dt, effect);
      const progress = Math.min(effect.elapsed / effect.duration, 1);

      updateParticles(effect.particles, dt);
      drawParticles(ctx!, effect.particles, effect.draw, progress);

      if (effect.postDraw) {
        effect.postDraw(ctx!, logicalW, logicalH, effect);
      }

      if (!alive || effect.elapsed >= effect.duration) {
        killAllParticles(effect.particles);
      }
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    cancelAnimationFrame(rafId);
  };
}
