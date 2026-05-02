import { beforeAll, describe, expect, it, vi } from 'vitest';

import { drawIconPrimitives } from './drawIconPrimitives';
import { GENERATED_TOPIC_ICON_NODES } from './generated/topicIconNodes';
import { GENERATED_MENTOR_ICON_NODES } from './generated/mentorIconNodes';

/**
 * jsdom does not implement `Path2D`. The shared primitive drawer constructs
 * a `Path2D` for every `path` SVG primitive, so we install a minimal stub
 * once per file. The stub is intentionally inert: the test only asserts the
 * drawer's calls into the canvas context, not that strokes were actually
 * rendered.
 */
beforeAll(() => {
  if (typeof (globalThis as { Path2D?: unknown }).Path2D === 'undefined') {
    class Path2DStub {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_d?: string) {
        /* no-op */
      }
    }
    (globalThis as { Path2D?: unknown }).Path2D = Path2DStub;
  }
});

function makeStubContext(): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe('drawIconPrimitives', () => {
  it('strokes a topic-icon entry without throwing (boundary smoke)', () => {
    const ctx = makeStubContext();
    expect(() =>
      drawIconPrimitives(
        ctx,
        GENERATED_TOPIC_ICON_NODES.atom,
        0,
        0,
        24,
        '#fff',
      ),
    ).not.toThrow();
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('strokes a mentor-icon entry without throwing (shared drawer)', () => {
    const ctx = makeStubContext();
    expect(() =>
      drawIconPrimitives(
        ctx,
        GENERATED_MENTOR_ICON_NODES.smile,
        0,
        0,
        24,
        '#fff',
      ),
    ).not.toThrow();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('handles polygon and rect primitives in the philosopher-stone glyph', () => {
    const ctx = makeStubContext();
    drawIconPrimitives(
      ctx,
      GENERATED_MENTOR_ICON_NODES['philosopher-stone'],
      0,
      0,
      24,
      '#fff',
    );
    expect(ctx.rect).toHaveBeenCalledTimes(1);
    // Two `circle` arcs (outer + inner of the philosopher-stone glyph).
    expect(ctx.arc).toHaveBeenCalledTimes(2);
    // Polygon's `closePath`.
    expect(ctx.closePath).toHaveBeenCalledTimes(1);
  });
});
