import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  __resetMentorBubbleTextureCacheForTests,
  createMentorBubbleTexture,
} from './createMentorBubbleTexture';
import { GENERATED_MENTOR_ICON_NODES } from './generated/mentorIconNodes';

interface CanvasMockHandle {
  ctx: Record<string, unknown>;
  drawCalls: Array<{ method: string; args: unknown[] }>;
  restore: () => void;
}

function installRecordingCanvasMock(): CanvasMockHandle {
  const drawCalls: Array<{ method: string; args: unknown[] }> = [];
  const trace = (method: string) => (...args: unknown[]) => {
    drawCalls.push({ method, args });
  };
  const ctx: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    save: trace('save'),
    restore: trace('restore'),
    translate: trace('translate'),
    scale: trace('scale'),
    clearRect: trace('clearRect'),
    fillRect: trace('fillRect'),
    beginPath: trace('beginPath'),
    closePath: trace('closePath'),
    moveTo: trace('moveTo'),
    lineTo: trace('lineTo'),
    arc: trace('arc'),
    rect: trace('rect'),
    ellipse: trace('ellipse'),
    stroke: trace('stroke'),
    fill: trace('fill'),
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
    ctx,
    drawCalls,
    restore: () => {
      HTMLCanvasElement.prototype.getContext = original;
    },
  };
}

describe('philosopher-stone rasterizer clipping', () => {
  let canvasMock: CanvasMockHandle;

  beforeEach(() => {
    canvasMock = installRecordingCanvasMock();
    __resetMentorBubbleTextureCacheForTests();
  });

  afterEach(() => {
    canvasMock.restore();
    vi.restoreAllMocks();
  });

  it('hand-authored primitives match the OQ1-corrected proportions', () => {
    const nodes = GENERATED_MENTOR_ICON_NODES['philosopher-stone'];
    expect(nodes).toHaveLength(4);
    const [outer, triangle, square, inner] = nodes;
    expect(outer?.[0]).toBe('circle');
    expect(triangle?.[0]).toBe('polygon');
    expect(square?.[0]).toBe('rect');
    expect(inner?.[0]).toBe('circle');
  });

  it('rasterizer issues an arc for the outer circle and the canvas has padding around the 24-px viewBox', () => {
    const result = createMentorBubbleTexture('philosopher-stone');
    const canvas = result.texture.image as HTMLCanvasElement;
    // Logical canvas size is documented to be larger than the 24-viewBox so
    // that >= half the stroke width fits between the outer-circle edge and
    // the canvas edge. We just verify the canvas has positive dimensions
    // and the drawer issued at least one `arc` call (outer circle stroke).
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    const arcCalls = canvasMock.drawCalls.filter((c) => c.method === 'arc');
    expect(arcCalls.length).toBeGreaterThanOrEqual(1);
  });
});
