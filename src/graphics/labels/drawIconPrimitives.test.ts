import { describe, expect, it, vi } from 'vitest';

import { drawIconPrimitives } from './drawIconPrimitives';
import { GENERATED_TOPIC_ICON_NODES } from './generated/topicIconNodes';
import { GENERATED_MENTOR_ICON_NODES } from './generated/mentorIconNodes';

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
    // Two `circle` arcs + the polygon's `closePath`.
    expect(ctx.arc).toHaveBeenCalledTimes(2);
    expect(ctx.closePath).toHaveBeenCalledTimes(1);
  });
});
