import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Three.js entry the texture module imports so the unit suite stays
// independent of the real WebGPU surface (which jsdom does not provide).
vi.mock('three/webgpu', () => {
  class CanvasTextureStub {
    image: HTMLCanvasElement;
    needsUpdate = false;
    anisotropy = 0;
    minFilter: unknown = null;
    magFilter: unknown = null;
    colorSpace: unknown = null;
    constructor(canvas: HTMLCanvasElement) {
      this.image = canvas;
    }
    dispose(): void {
      /* no-op */
    }
  }
  return {
    CanvasTexture: CanvasTextureStub,
    LinearMipmapLinearFilter: 'linear-mipmap-linear',
    LinearFilter: 'linear',
    SRGBColorSpace: 'srgb',
    NearestFilter: 'nearest',
    NearestMipmapLinearFilter: 'nearest-mipmap-linear',
    NearestMipmapNearestFilter: 'nearest-mipmap-nearest',
    LinearMipmapNearestFilter: 'linear-mipmap-nearest',
  };
});

// Stub the icon drawer; the boundary it covers (lucide vector data) is
// validated separately by `topicIconNodes.test.ts` and the import-boundary
// scan. Here we only care that it is invoked when an iconName is supplied.
vi.mock('./drawTopicIcon', () => ({
  drawTopicIcon: vi.fn(),
}));

import { createCrystalLabelTexture } from './crystalLabelTexture';
import { drawTopicIcon } from './drawTopicIcon';

interface CanvasMockHandle {
  restore: () => void;
}

/**
 * jsdom's HTMLCanvasElement.getContext returns null. Install a minimal 2D
 * context stub so the texture module's `measureText` and drawing calls behave
 * deterministically without needing node-canvas or `canvas` polyfills.
 */
function installCanvasMock(): CanvasMockHandle {
  const ctx: Record<string, unknown> & {
    font: string;
    measureText: (text: string) => { width: number };
  } = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    textBaseline: '',
    textAlign: '',
    globalAlpha: 1,
    measureText: (text: string) => ({ width: Math.max(1, text.length * 7) }),
    fillText: () => undefined,
    fillRect: () => undefined,
    clearRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    rotate: () => undefined,
    setTransform: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    bezierCurveTo: () => undefined,
    arc: () => undefined,
    arcTo: () => undefined,
    rect: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    clip: () => undefined,
  };

  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patchedGetContext(
    this: HTMLCanvasElement,
    type: string,
  ) {
    if (type === '2d') {
      return ctx as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;

  return {
    restore: () => {
      HTMLCanvasElement.prototype.getContext = original;
    },
  };
}

describe('createCrystalLabelTexture', () => {
  let canvasMock: CanvasMockHandle;

  beforeEach(() => {
    canvasMock = installCanvasMock();
    vi.clearAllMocks();
  });

  afterEach(() => {
    canvasMock.restore();
  });

  it('returns a positive aspect ratio for a plain text label', () => {
    const result = createCrystalLabelTexture('Calculus');

    expect(result.aspect).toBeGreaterThan(0);
    expect(result.pixelWidth).toBeGreaterThan(0);
    expect(result.pixelHeight).toBeGreaterThan(0);
    expect(result.texture.image).toBeInstanceOf(HTMLCanvasElement);
    expect(drawTopicIcon).not.toHaveBeenCalled();
  });

  it('returns a positive aspect ratio when an icon glyph is supplied', () => {
    const result = createCrystalLabelTexture('Calculus', 'sigma');

    expect(result.aspect).toBeGreaterThan(0);
    expect(result.pixelWidth).toBeGreaterThan(0);
    expect(result.pixelHeight).toBeGreaterThan(0);
    expect(drawTopicIcon).toHaveBeenCalledTimes(1);
  });

  it('regenerates a wider texture when an icon glyph is added to the same text', () => {
    const withoutIcon = createCrystalLabelTexture('Calculus');
    const withIcon = createCrystalLabelTexture('Calculus', 'sigma');

    expect(withIcon.pixelWidth).toBeGreaterThan(withoutIcon.pixelWidth);
    expect(withIcon.aspect).toBeGreaterThan(withoutIcon.aspect);
    expect(withIcon.texture).not.toBe(withoutIcon.texture);
  });
});
