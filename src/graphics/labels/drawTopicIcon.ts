import type { TopicIconName } from '@/types/core';
import {
  GENERATED_TOPIC_ICON_NODES,
  type GeneratedTopicIconPrimitive,
} from './generated/topicIconNodes';

function numberValue(value: string | number): number {
  return typeof value === 'number' ? value : Number.parseFloat(value);
}

/**
 * Lucide raw nodes occasionally include `fill: "currentColor"` (e.g.,
 * palette's color accent dots). All other shapes ship as stroke-only
 * outlines (`fill: "none"` is implicit at the SVG root) and must remain
 * unfilled.
 */
function shouldFill(attrs: { fill?: string }): boolean {
  if (typeof attrs.fill !== 'string') return false;
  if (attrs.fill === 'none' || attrs.fill === 'transparent') return false;
  return true;
}

/**
 * Stroke (and optionally fill) the raw vector primitives of a Lucide topic
 * icon into a 2D canvas at the given (x, y) origin. The icon is scaled to
 * fit a `size`-pixel square around its 24x24 viewBox and drawn with the
 * supplied stroke `color`. Fills, where present in the source data (e.g.,
 * palette dots), use the same color so the icon stays monochrome.
 *
 * Runtime never imports lucide / lucide-react — vector data flows from the
 * build-time-generated `topicIconNodes.ts`.
 */
export function drawTopicIcon(
  ctx: CanvasRenderingContext2D,
  iconName: TopicIconName,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  // Widen at consumption so per-tag narrowing inside the loop sees the full
  // primitive union — including `fill?: string` (uniform across variants,
  // consumed by `shouldFill`) and the currently-unused `polyline`/`polygon`
  // branches reserved for future icon additions. The generated record
  // intentionally keeps `as const satisfies …` to validate emitted data
  // against the union at write time; this annotation only relaxes the
  // consumer's view, not the validation.
  const nodes: readonly GeneratedTopicIconPrimitive[] =
    GENERATED_TOPIC_ICON_NODES[iconName];

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [tag, attrs] of nodes) {
    if (tag === 'path') {
      const path = new Path2D(attrs.d);
      ctx.stroke(path);
      if (shouldFill(attrs)) ctx.fill(path);
      continue;
    }

    if (tag === 'line') {
      ctx.beginPath();
      ctx.moveTo(numberValue(attrs.x1), numberValue(attrs.y1));
      ctx.lineTo(numberValue(attrs.x2), numberValue(attrs.y2));
      ctx.stroke();
      continue;
    }

    if (tag === 'circle') {
      ctx.beginPath();
      ctx.arc(
        numberValue(attrs.cx),
        numberValue(attrs.cy),
        numberValue(attrs.r),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      if (shouldFill(attrs)) ctx.fill();
      continue;
    }

    if (tag === 'rect') {
      ctx.beginPath();
      ctx.rect(
        numberValue(attrs.x),
        numberValue(attrs.y),
        numberValue(attrs.width),
        numberValue(attrs.height),
      );
      ctx.stroke();
      if (shouldFill(attrs)) ctx.fill();
      continue;
    }

    if (tag === 'polyline' || tag === 'polygon') {
      const points = attrs.points
        .trim()
        .split(/\s+/)
        .map((point) => point.split(',').map(Number));

      ctx.beginPath();
      points.forEach(([pointX, pointY], index) => {
        if (index === 0) ctx.moveTo(pointX, pointY);
        else ctx.lineTo(pointX, pointY);
      });
      if (tag === 'polygon') ctx.closePath();
      ctx.stroke();
      if (shouldFill(attrs)) ctx.fill();
      continue;
    }

    if (tag === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(
        numberValue(attrs.cx),
        numberValue(attrs.cy),
        numberValue(attrs.rx),
        numberValue(attrs.ry),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      if (shouldFill(attrs)) ctx.fill();
      continue;
    }
  }

  ctx.restore();
}
