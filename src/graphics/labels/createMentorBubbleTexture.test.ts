import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock three/webgpu since jsdom does not provide a WebGPU surface.
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
  };
});

vi.mock('../../graphics/labels/drawMentorIcon', () => ({
  drawMentorIcon: vi.fn(),
}));

vi.mock('./drawMentorIcon', () => ({
  drawMentorIcon: vi.fn(),
}));

import {
  __resetMentorBubbleTextureCacheForTests,
  createMentorBubbleTexture,
} from './createMentorBubbleTexture';
import { drawMentorIcon } from './drawMentorIcon';

interface CanvasMockHandle {
  restore: () => void;
}

function installCanvasMock(): CanvasMockHandle {
  const ctx: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    measureText: () => ({ width: 1 }),
    fillText: () => undefined,
    fillRect: () => undefined,
    clearRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    rect: () => undefined,
    ellipse: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
  };

  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patched(
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

describe('createMentorBubbleTexture', () => {
  let canvasMock: CanvasMockHandle;

  beforeEach(() => {
    canvasMock = installCanvasMock();
    vi.clearAllMocks();
    __resetMentorBubbleTextureCacheForTests();
  });

  afterEach(() => {
    canvasMock.restore();
  });

  it('produces a square canvas-backed texture for a mentor glyph', () => {
    const result = createMentorBubbleTexture('philosopher-stone');
    expect(result.size).toBeGreaterThan(0);
    expect(result.texture.image).toBeInstanceOf(HTMLCanvasElement);
    expect((result.texture.image as HTMLCanvasElement).width).toBeGreaterThan(0);
    expect((result.texture.image as HTMLCanvasElement).height).toBeGreaterThan(0);
  });

  it('caches by iconName alone (color is uniform-driven, not baked)', () => {
    const a = createMentorBubbleTexture('smile');
    const b = createMentorBubbleTexture('smile');
    expect(a.texture).toBe(b.texture);
    // drawMentorIcon should be invoked only on the first miss.
    expect(drawMentorIcon).toHaveBeenCalledTimes(1);
  });

  it('regenerates on a different iconName', () => {
    const a = createMentorBubbleTexture('compass');
    const b = createMentorBubbleTexture('network');
    expect(a.texture).not.toBe(b.texture);
    expect(drawMentorIcon).toHaveBeenCalledTimes(2);
  });
});
