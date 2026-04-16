/**
 * Procedural rune glyph generation and concentric ring drawing
 * for the Perfect (tier 4) rating effect.
 *
 * All drawing is done on a 2D canvas context — no WebGL/WebGPU.
 */

const TWO_PI = Math.PI * 2;

/** A set of simple procedural rune path generators. */
const RUNE_PATHS: Array<(size: number) => Path2D> = [
  // Vertical line with diamond
  (s) => {
    const p = new Path2D();
    p.moveTo(0, -s);
    p.lineTo(0, s);
    p.moveTo(-s * 0.4, 0);
    p.lineTo(0, -s * 0.5);
    p.lineTo(s * 0.4, 0);
    p.lineTo(0, s * 0.5);
    p.closePath();
    return p;
  },
  // Triangle with crossbar
  (s) => {
    const p = new Path2D();
    p.moveTo(0, -s);
    p.lineTo(-s * 0.7, s * 0.7);
    p.lineTo(s * 0.7, s * 0.7);
    p.closePath();
    p.moveTo(-s * 0.35, 0);
    p.lineTo(s * 0.35, 0);
    return p;
  },
  // X with circle
  (s) => {
    const p = new Path2D();
    p.moveTo(-s * 0.6, -s * 0.6);
    p.lineTo(s * 0.6, s * 0.6);
    p.moveTo(s * 0.6, -s * 0.6);
    p.lineTo(-s * 0.6, s * 0.6);
    p.moveTo(s * 0.35, 0);
    p.arc(0, 0, s * 0.35, 0, TWO_PI);
    return p;
  },
  // Arrow pointing up
  (s) => {
    const p = new Path2D();
    p.moveTo(0, -s);
    p.lineTo(-s * 0.5, -s * 0.3);
    p.moveTo(0, -s);
    p.lineTo(s * 0.5, -s * 0.3);
    p.moveTo(0, -s);
    p.lineTo(0, s);
    p.moveTo(-s * 0.3, s * 0.5);
    p.lineTo(s * 0.3, s * 0.5);
    return p;
  },
  // Double vertical with caps
  (s) => {
    const p = new Path2D();
    p.moveTo(-s * 0.25, -s);
    p.lineTo(-s * 0.25, s);
    p.moveTo(s * 0.25, -s);
    p.lineTo(s * 0.25, s);
    p.moveTo(-s * 0.5, -s);
    p.lineTo(s * 0.5, -s);
    p.moveTo(-s * 0.5, s);
    p.lineTo(s * 0.5, s);
    return p;
  },
  // Zigzag
  (s) => {
    const p = new Path2D();
    p.moveTo(-s * 0.5, -s);
    p.lineTo(s * 0.5, -s * 0.33);
    p.lineTo(-s * 0.5, s * 0.33);
    p.lineTo(s * 0.5, s);
    return p;
  },
  // Eye / vesica
  (s) => {
    const p = new Path2D();
    p.moveTo(-s * 0.8, 0);
    p.quadraticCurveTo(0, -s, s * 0.8, 0);
    p.quadraticCurveTo(0, s, -s * 0.8, 0);
    p.moveTo(s * 0.25, 0);
    p.arc(0, 0, s * 0.25, 0, TWO_PI);
    return p;
  },
  // Three rays from center
  (s) => {
    const p = new Path2D();
    for (let i = 0; i < 3; i++) {
      const angle = (TWO_PI / 3) * i - Math.PI / 2;
      p.moveTo(0, 0);
      p.lineTo(Math.cos(angle) * s, Math.sin(angle) * s);
    }
    return p;
  },
];

export function getRunePath(index: number, size: number): Path2D {
  return RUNE_PATHS[index % RUNE_PATHS.length](size);
}

export interface RingConfig {
  cx: number;
  cy: number;
  radius: number;
  lineWidth: number;
  color: string;
  /** 0..1 draw progress (animated via stroke-dashoffset technique). */
  progress: number;
  glowSize: number;
}

/**
 * Draw an arc ring with animated reveal using dasharray technique.
 */
export function drawRing(
  ctx: CanvasRenderingContext2D,
  config: RingConfig,
): void {
  const { cx, cy, radius, lineWidth, color, progress, glowSize } = config;
  if (progress <= 0) return;

  const circumference = TWO_PI * radius;
  const drawLength = circumference * Math.min(progress, 1);

  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';

  if (glowSize > 0) {
    ctx.shadowBlur = glowSize;
    ctx.shadowColor = color;
  }

  ctx.setLineDash([drawLength, circumference - drawLength]);
  ctx.lineDashOffset = 0;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + TWO_PI);
  ctx.stroke();
  ctx.restore();
}

export interface RuneGlyphConfig {
  cx: number;
  cy: number;
  ringRadius: number;
  glyphCount: number;
  glyphSize: number;
  /** 0..1 how many glyphs are illuminated. */
  revealProgress: number;
  color: string;
  glowSize: number;
}

/**
 * Draw rune glyphs placed equidistantly on a ring.
 */
export function drawRuneGlyphs(
  ctx: CanvasRenderingContext2D,
  config: RuneGlyphConfig,
): void {
  const { cx, cy, ringRadius, glyphCount, glyphSize, revealProgress, color, glowSize } = config;
  const illuminatedCount = Math.floor(revealProgress * glyphCount);
  const fractional = (revealProgress * glyphCount) - illuminatedCount;

  for (let i = 0; i < glyphCount; i++) {
    const angle = (TWO_PI / glyphCount) * i - Math.PI / 2;
    const gx = cx + Math.cos(angle) * ringRadius;
    const gy = cy + Math.sin(angle) * ringRadius;

    let alpha: number;
    if (i < illuminatedCount) {
      alpha = 1;
    } else if (i === illuminatedCount) {
      alpha = fractional;
    } else {
      alpha = 0;
    }

    if (alpha <= 0.01) continue;

    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(angle + Math.PI / 2);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (glowSize > 0 && alpha > 0.3) {
      ctx.shadowBlur = glowSize * alpha;
      ctx.shadowColor = color;
    }

    const path = getRunePath(i, glyphSize);
    ctx.stroke(path);
    ctx.restore();
  }
}
