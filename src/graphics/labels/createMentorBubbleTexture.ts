import * as THREE from 'three/webgpu';
import type { MentorIconName } from '@/types/core';
import { drawMentorIcon } from './drawMentorIcon';

export interface MentorBubbleTextureResult {
  texture: THREE.CanvasTexture;
  size: number;
}

const MAX_DEVICE_PIXEL_RATIO = 2;
/** Logical canvas size (square). Final pixels = LOGICAL_SIZE * dpr. */
const LOGICAL_SIZE = 96;
/**
 * Stroke width at 24-px viewBox. The drawer scales this with the canvas via
 * its own transform; we only need to ensure the canvas has at least half a
 * stroke width of padding so the philosopher-stone outer circle stroke does
 * not clip against the canvas edge.
 */
const STROKE_WIDTH_24 = 2.5;
/** Padding in 24-viewBox units (>= half stroke width, OQ1 rasterizer fix). */
const PADDING_24 = STROKE_WIDTH_24 / 2 + 0.5;
/**
 * Visible glyph size on the logical canvas, leaving a uniform padding ring on
 * all sides. The drawer uses this size to scale the 24-viewBox primitives.
 */
const GLYPH_SIZE = LOGICAL_SIZE * (1 - (PADDING_24 * 2) / 24);
const GLYPH_OFFSET = (LOGICAL_SIZE - GLYPH_SIZE) / 2;

/**
 * Module-level cache keyed by `iconName` ALONE. Color is delivered to the
 * material via uniforms, not baked into the texture, so caching by icon
 * identity is correct (OQ2). The cache survives across MentorBubble mounts.
 */
const CACHE = new Map<MentorIconName, MentorBubbleTextureResult>();

function resolveDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.devicePixelRatio ?? 1;
  return Math.min(raw, MAX_DEVICE_PIXEL_RATIO);
}

/**
 * Rasterizes a mentor-bubble glyph into a transparent, square WebGPU-friendly
 * `CanvasTexture` whose alpha channel is the only color-bearing data. The
 * mentor bubble material delivers actual color via `glyphColor` uniforms,
 * enabling cheap mood / alert color cross-fades without
 * regenerating the texture.
 */
export function createMentorBubbleTexture(
  iconName: MentorIconName,
): MentorBubbleTextureResult {
  const cached = CACHE.get(iconName);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('createMentorBubbleTexture: 2D context unavailable');
  }

  const dpr = resolveDevicePixelRatio();
  canvas.width = Math.max(1, Math.floor(LOGICAL_SIZE * dpr));
  canvas.height = Math.max(1, Math.floor(LOGICAL_SIZE * dpr));
  canvas.style.width = `${LOGICAL_SIZE}px`;
  canvas.style.height = `${LOGICAL_SIZE}px`;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

  // Alpha mask: stroke white into a transparent canvas. The material multiplies
  // sampled alpha by the color uniform. RGB on the canvas is never sampled.
  drawMentorIcon(ctx, iconName, GLYPH_OFFSET, GLYPH_OFFSET, GLYPH_SIZE, '#ffffff');

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const result: MentorBubbleTextureResult = { texture, size: LOGICAL_SIZE };
  CACHE.set(iconName, result);
  return result;
}

/** Test-only helper: clears the in-module texture cache. */
export function __resetMentorBubbleTextureCacheForTests(): void {
  for (const { texture } of CACHE.values()) {
    try {
      texture.dispose();
    } catch {
      /* no-op */
    }
  }
  CACHE.clear();
}
