import * as THREE from 'three/webgpu';
import {
  LABEL_BG_COLOR,
  LABEL_BORDER_COLOR,
  LABEL_CORNER_RADIUS,
  LABEL_DEFAULT_PIXEL_HEIGHT,
  LABEL_FONT,
  LABEL_MAX_PIXEL_WIDTH,
  LABEL_PADDING_X,
  LABEL_PADDING_Y,
  LABEL_TEXT_COLOR,
} from './crystalLabelConstants';

export interface CrystalLabelTextureResult {
  texture: THREE.CanvasTexture;
  pixelWidth: number;
  pixelHeight: number;
  aspect: number;
}

const MAX_DEVICE_PIXEL_RATIO = 2;

function resolveDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.devicePixelRatio ?? 1;
  return Math.min(raw, MAX_DEVICE_PIXEL_RATIO);
}

function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const ellipsis = '…';
  let candidate = text;
  while (candidate.length > 1 && ctx.measureText(candidate + ellipsis).width > maxWidth) {
    candidate = candidate.slice(0, -1);
  }
  return candidate + ellipsis;
}

function paintRoundedRect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
}

/**
 * Rasterizes label text into a CanvasTexture on the main thread.
 * Produces a WebGPU-compatible THREE.CanvasTexture with mipmaps + sRGB color space.
 *
 * Canvas2D is used instead of an SDF atlas to avoid shipping a binary font asset.
 * Labels are short (topic names) and count is capped upstream, so per-label
 * canvases are cheap (< 1 KB upload per label).
 */
export function createCrystalLabelTexture(text: string): CrystalLabelTextureResult {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('createCrystalLabelTexture: 2D context unavailable');
  }

  const dpr = resolveDevicePixelRatio();
  ctx.font = LABEL_FONT;
  const maxTextWidth = LABEL_MAX_PIXEL_WIDTH - LABEL_PADDING_X * 2;
  const drawText = truncateToWidth(ctx, text, maxTextWidth);
  const textWidth = Math.ceil(ctx.measureText(drawText).width);
  const pixelWidth = Math.min(textWidth + LABEL_PADDING_X * 2, LABEL_MAX_PIXEL_WIDTH);
  const pixelHeight = LABEL_DEFAULT_PIXEL_HEIGHT;

  canvas.width = Math.max(1, Math.floor(pixelWidth * dpr));
  canvas.height = Math.max(1, Math.floor(pixelHeight * dpr));
  canvas.style.width = `${pixelWidth}px`;
  canvas.style.height = `${pixelHeight}px`;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, pixelWidth, pixelHeight);

  paintRoundedRect(ctx, pixelWidth, pixelHeight, LABEL_CORNER_RADIUS);
  ctx.fillStyle = LABEL_BG_COLOR;
  ctx.fill();
  ctx.strokeStyle = LABEL_BORDER_COLOR;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = LABEL_FONT;
  ctx.fillStyle = LABEL_TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(drawText, pixelWidth / 2, pixelHeight / 2 + LABEL_PADDING_Y / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return {
    texture,
    pixelWidth,
    pixelHeight,
    aspect: pixelWidth / pixelHeight,
  };
}
