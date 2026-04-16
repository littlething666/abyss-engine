/**
 * Rating-dependent visual effect factories.
 *
 * Each factory creates a ParticleEffect for the given EffectConfig.
 * Effects are pure 2D canvas — no WebGL/WebGPU dependencies.
 */

import type { EffectConfig, Particle, ParticleEffect } from './types';
import { createParticlePool, spawnParticle } from './particleEngine';
import { drawRing, drawRuneGlyphs } from './runeGeometry';

let effectCounter = 0;
function nextEffectId(tier: number): string {
  return `fx-${tier}-${++effectCounter}-${Date.now()}`;
}

// ─── Helpers ───────────────────────────────────────────────────

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ─── Tier 1: MistShudder ───────────────────────────────────────

export function createMistShudder(config: EffectConfig): ParticleEffect {
  const { cardRect } = config;
  const pool = createParticlePool();
  const cx = cardRect.x + cardRect.width / 2;
  const cy = cardRect.y + cardRect.height / 2;
  let spawned = false;

  return {
    id: nextEffectId(1),
    particles: pool,
    elapsed: 0,
    duration: 0.8,
    update(dt, effect) {
      if (!spawned) {
        spawned = true;
        const count = Math.floor(randRange(15, 25));
        for (let i = 0; i < count; i++) {
          const edge = Math.floor(Math.random() * 4);
          let sx: number;
          let sy: number;
          switch (edge) {
            case 0: sx = cardRect.x + Math.random() * cardRect.width; sy = cardRect.y; break;
            case 1: sx = cardRect.x + cardRect.width; sy = cardRect.y + Math.random() * cardRect.height; break;
            case 2: sx = cardRect.x + Math.random() * cardRect.width; sy = cardRect.y + cardRect.height; break;
            default: sx = cardRect.x; sy = cardRect.y + Math.random() * cardRect.height; break;
          }
          const angle = Math.atan2(cy - sy, cx - sx) + randRange(-0.5, 0.5);
          const speed = randRange(15, 40);
          spawnParticle(pool, {
            x: sx,
            y: sy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: randRange(0.4, 0.7),
            maxLife: 0.7,
            radius: randRange(8, 18),
            r: 80,
            g: 60,
            b: 120,
            alpha: randRange(0.12, 0.25),
            glow: 6,
          });
        }
      }
      return effect.elapsed < effect.duration;
    },
  };
}

// ─── Tier 2: EmberSparks ───────────────────────────────────────

export function createEmberSparks(config: EffectConfig): ParticleEffect {
  const { cardRect } = config;
  const pool = createParticlePool();
  let spawned = false;

  return {
    id: nextEffectId(2),
    particles: pool,
    elapsed: 0,
    duration: 1.0,
    update(dt, effect) {
      if (!spawned) {
        spawned = true;
        const count = Math.floor(randRange(20, 35));
        const baseX = cardRect.x + cardRect.width / 2;
        const baseY = cardRect.y + cardRect.height;
        for (let i = 0; i < count; i++) {
          const angle = -Math.PI / 2 + randRange(-0.6, 0.6);
          const speed = randRange(40, 100);
          const isHot = Math.random() > 0.4;
          spawnParticle(pool, {
            x: baseX + randRange(-cardRect.width * 0.3, cardRect.width * 0.3),
            y: baseY + randRange(-5, 5),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: randRange(0.5, 0.9),
            maxLife: 0.9,
            radius: randRange(1.5, 3.5),
            r: isHot ? 255 : 220,
            g: isHot ? 160 : 100,
            b: isHot ? 50 : 30,
            alpha: randRange(0.6, 1),
            glow: randRange(4, 10),
          });
        }
      }
      return effect.elapsed < effect.duration;
    },
  };
}

// ─── Tier 3: ArcaneSparkles ────────────────────────────────────

function drawStarParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  _progress: number,
): void {
  const fadeAlpha = p.alpha * Math.min(1, p.life / Math.max(p.maxLife * 0.3, 0.05));
  if (fadeAlpha <= 0.001) return;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.globalAlpha = fadeAlpha;

  if (p.glow > 0) {
    ctx.shadowBlur = p.glow;
    ctx.shadowColor = `rgba(${p.r},${p.g},${p.b},${fadeAlpha})`;
  }

  ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${fadeAlpha})`;
  ctx.beginPath();
  const spikes = 4;
  const outerR = p.radius;
  const innerR = p.radius * 0.4;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    if (i === 0) {
      ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    } else {
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function createArcaneSparkles(config: EffectConfig): ParticleEffect {
  const { cardRect } = config;
  const pool = createParticlePool();
  let spawned = false;
  const cx = cardRect.x + cardRect.width / 2;
  const cy = cardRect.y + cardRect.height / 2;

  return {
    id: nextEffectId(3),
    particles: pool,
    elapsed: 0,
    duration: 1.2,
    draw: drawStarParticle,
    update(dt, effect) {
      if (!spawned) {
        spawned = true;
        const count = Math.floor(randRange(40, 60));
        for (let i = 0; i < count; i++) {
          const angle = randRange(0, Math.PI * 2);
          const speed = randRange(60, 160);
          const colorChoice = Math.random();
          let r: number, g: number, b: number;
          if (colorChoice < 0.33) {
            r = 100; g = 220; b = 255; // cyan
          } else if (colorChoice < 0.66) {
            r = 200; g = 230; b = 255; // white-blue
          } else {
            r = 180; g = 140; b = 255; // crystal purple
          }
          spawnParticle(pool, {
            x: cx + randRange(-10, 10),
            y: cy + randRange(-10, 10),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: randRange(0.5, 1.0),
            maxLife: 1.0,
            radius: randRange(3, 7),
            r,
            g,
            b,
            alpha: randRange(0.7, 1),
            rotation: randRange(0, Math.PI * 2),
            rotationSpeed: randRange(-4, 4),
            glow: randRange(6, 14),
          });
        }
      }
      // Apply gentle deceleration
      for (const p of pool) {
        if (!p.alive) continue;
        p.vx *= 0.97;
        p.vy *= 0.97;
      }
      return effect.elapsed < effect.duration;
    },
    postDraw(ctx, width, height, effect) {
      // Faint radial light behind card center
      const progress = effect.elapsed / effect.duration;
      if (progress > 0.6) return;
      const intensity = (1 - progress / 0.6) * 0.12;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, cardRect.width * 0.8);
      gradient.addColorStop(0, `rgba(140,200,255,${intensity})`);
      gradient.addColorStop(1, 'rgba(140,200,255,0)');
      ctx.save();
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },
  };
}

// ─── Tier 4: RuneCircle ────────────────────────────────────────

export function createRuneCircle(config: EffectConfig): ParticleEffect {
  const { cardRect, canvasWidth, canvasHeight } = config;
  const pool = createParticlePool();
  const cx = cardRect.x + cardRect.width / 2;
  const cy = cardRect.y + cardRect.height / 2;
  let burstSpawned = false;

  // Ring timing constants (seconds)
  const RING1_START = 0;
  const RING1_DURATION = 0.5;
  const RING2_START = 0.25;
  const RING2_DURATION = 0.5;
  const GLYPH_START = 0.3;
  const GLYPH_DURATION = 0.7;
  const BURST_TIME = 0.8;
  const VIGNETTE_START = 0.6;
  const VIGNETTE_DURATION = 0.8;

  const outerRadius = Math.max(cardRect.width, cardRect.height) * 0.6;
  const innerRadius = outerRadius * 0.72;

  return {
    id: nextEffectId(4),
    particles: pool,
    elapsed: 0,
    duration: 2.0,
    draw: drawStarParticle,
    update(dt, effect) {
      // Spawn particle burst at the right time
      if (!burstSpawned && effect.elapsed >= BURST_TIME) {
        burstSpawned = true;
        const count = Math.floor(randRange(60, 80));
        for (let i = 0; i < count; i++) {
          const angle = randRange(0, Math.PI * 2);
          const speed = randRange(80, 200);
          const colorChoice = Math.random();
          let r: number, g: number, b: number;
          if (colorChoice < 0.5) {
            r = 255; g = 215; b = 80; // gold
          } else if (colorChoice < 0.8) {
            r = 255; g = 255; b = 200; // bright gold-white
          } else {
            r = 180; g = 140; b = 255; // crystal purple accent
          }
          spawnParticle(pool, {
            x: cx + randRange(-8, 8),
            y: cy + randRange(-8, 8),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: randRange(0.5, 1.0),
            maxLife: 1.0,
            radius: randRange(3, 6),
            r,
            g,
            b,
            alpha: randRange(0.7, 1),
            rotation: randRange(0, Math.PI * 2),
            rotationSpeed: randRange(-5, 5),
            glow: randRange(8, 16),
          });
        }
      }

      // Decelerate burst particles
      for (const p of pool) {
        if (!p.alive) continue;
        p.vx *= 0.96;
        p.vy *= 0.96;
      }

      return effect.elapsed < effect.duration;
    },
    postDraw(ctx, width, height, effect) {
      const t = effect.elapsed;

      // Ring 1 (outer) — cyan glow
      const ring1Progress = Math.max(0, Math.min(1, (t - RING1_START) / RING1_DURATION));
      drawRing(ctx, {
        cx,
        cy,
        radius: outerRadius,
        lineWidth: 2,
        color: `rgba(100,220,255,${0.7 * Math.min(1, (effect.duration - t) / 0.4)})`,
        progress: easeOutCubic(ring1Progress),
        glowSize: 12,
      });

      // Ring 2 (inner) — gold/white
      const ring2Progress = Math.max(0, Math.min(1, (t - RING2_START) / RING2_DURATION));
      drawRing(ctx, {
        cx,
        cy,
        radius: innerRadius,
        lineWidth: 2.5,
        color: `rgba(255,215,100,${0.85 * Math.min(1, (effect.duration - t) / 0.4)})`,
        progress: easeOutCubic(ring2Progress),
        glowSize: 16,
      });

      // Rune glyphs on outer ring
      const glyphProgress = Math.max(0, Math.min(1, (t - GLYPH_START) / GLYPH_DURATION));
      if (glyphProgress > 0) {
        const fadeOut = Math.min(1, (effect.duration - t) / 0.5);
        drawRuneGlyphs(ctx, {
          cx,
          cy,
          ringRadius: outerRadius,
          glyphCount: 8,
          glyphSize: 10,
          revealProgress: easeInOutQuad(glyphProgress),
          color: `rgba(200,230,255,${0.9 * fadeOut})`,
          glowSize: 10,
        });
      }

      // Radial light pulse at burst time
      if (t >= BURST_TIME && t < BURST_TIME + 0.4) {
        const pulseP = (t - BURST_TIME) / 0.4;
        const intensity = (1 - pulseP) * 0.18;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRadius * 1.5);
        gradient.addColorStop(0, `rgba(255,255,230,${intensity})`);
        gradient.addColorStop(1, 'rgba(255,255,230,0)');
        ctx.save();
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      // Golden screen-edge vignette
      if (t >= VIGNETTE_START && t < VIGNETTE_START + VIGNETTE_DURATION) {
        const vp = (t - VIGNETTE_START) / VIGNETTE_DURATION;
        const vignetteAlpha = vp < 0.3 ? vp / 0.3 : 1 - (vp - 0.3) / 0.7;
        const maxAlpha = vignetteAlpha * 0.08;
        if (maxAlpha > 0.001) {
          const edgeGrad = ctx.createRadialGradient(
            width / 2,
            height / 2,
            Math.min(width, height) * 0.35,
            width / 2,
            height / 2,
            Math.max(width, height) * 0.7,
          );
          edgeGrad.addColorStop(0, 'rgba(255,200,80,0)');
          edgeGrad.addColorStop(1, `rgba(255,200,80,${maxAlpha})`);
          ctx.save();
          ctx.fillStyle = edgeGrad;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
      }
    },
  };
}

// ─── Factory ───────────────────────────────────────────────────

export function createEffectForTier(config: EffectConfig): ParticleEffect {
  switch (config.tier) {
    case 1:
      return createMistShudder(config);
    case 2:
      return createEmberSparks(config);
    case 3:
      return createArcaneSparkles(config);
    case 4:
      return createRuneCircle(config);
    default:
      return createArcaneSparkles(config);
  }
}
