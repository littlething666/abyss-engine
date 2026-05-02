import type { MentorIconName } from '@/types/core';
import {
  GENERATED_MENTOR_ICON_NODES,
  type GeneratedMentorIconPrimitive,
} from './generated/mentorIconNodes';
import { drawIconPrimitives } from './drawIconPrimitives';

/**
 * Stroke (and optionally fill) the raw vector primitives of a mentor-bubble
 * icon (Lucide-derived or the custom philosopher-stone) into a 2D canvas at
 * the given (x, y) origin. Thin wrapper around the shared primitive drawer.
 *
 * Runtime never imports lucide / lucide-react — vector data flows from the
 * build-time-generated `mentorIconNodes.ts`.
 */
export function drawMentorIcon(
  ctx: CanvasRenderingContext2D,
  iconName: MentorIconName,
  x: number,
  y: number,
  size: number,
  color: string,
  lineWidth = 2,
): void {
  const nodes: readonly GeneratedMentorIconPrimitive[] =
    GENERATED_MENTOR_ICON_NODES[iconName];

  drawIconPrimitives(ctx, nodes, x, y, size, color, lineWidth);
}
