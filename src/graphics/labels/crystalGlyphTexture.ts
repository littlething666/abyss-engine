import * as THREE from 'three/webgpu';

export interface CrystalGlyphTextureResult {
  texture: THREE.CanvasTexture;
  aspect: number;
}

const MAX_DEVICE_PIXEL_RATIO = 2;

const GLYPH_FONT =
  '600 56px system-ui, -apple-system, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

function resolveDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.devicePixelRatio ?? 1;
  return Math.min(raw, MAX_DEVICE_PIXEL_RATIO);
}

/**
 * Rasterizes a single unicode glyph (e.g. an emoji) into a transparent
 * WebGPU-friendly CanvasTexture with a square aspect ratio.
 */
export function createCrystalGlyphTexture(glyph: string): CrystalGlyphTextureResult {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('createCrystalGlyphTexture: 2D context unavailable');
  }

  const dpr = resolveDevicePixelRatio();
  ctx.font = GLYPH_FONT;
  const pad = 8;
  const m = ctx.measureText(glyph);
  const textW = Math.ceil(m.width);
  const textH = Math.ceil(
    (m.actualBoundingBoxAscent ?? 28) + (m.actualBoundingBoxDescent ?? 8),
  );
  const pixelSize = Math.max(64, Math.ceil(textW + pad * 2), Math.ceil(textH + pad * 2));

  canvas.width = Math.max(1, Math.floor(pixelSize * dpr));
  canvas.height = Math.max(1, Math.floor(pixelSize * dpr));
  canvas.style.width = `${pixelSize}px`;
  canvas.style.height = `${pixelSize}px`;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, pixelSize, pixelSize);

  ctx.font = GLYPH_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(glyph, pixelSize / 2, pixelSize / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return {
    texture,
    aspect: 1,
  };
}
