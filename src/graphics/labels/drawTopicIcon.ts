import type { TopicIconName } from '@/types/core';
import {
  GENERATED_TOPIC_ICON_NODES,
  type GeneratedTopicIconPrimitive,
} from './generated/topicIconNodes';
import { drawIconPrimitives } from './drawIconPrimitives';

/**
 * Stroke (and optionally fill) the raw vector primitives of a Lucide topic
 * icon into a 2D canvas at the given (x, y) origin. Thin wrapper that
 * resolves the topic icon node table and forwards to the shared primitive
 * drawer (`drawIconPrimitives`).
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
  // Widen at consumption so per-tag narrowing inside the primitive drawer
  // sees the full tagged-tuple union — including `fill?: string` (uniform
  // across variants, consumed by the drawer's `shouldFill` helper) and the
  // currently-unused `polyline`/`polygon` branches reserved for future icon
  // additions. The generated record intentionally keeps
  // `as const satisfies …` to validate emitted data against the union at
  // write time; this annotation only relaxes the consumer's view, not the
  // validation.
  const nodes: readonly GeneratedTopicIconPrimitive[] =
    GENERATED_TOPIC_ICON_NODES[iconName];

  drawIconPrimitives(ctx, nodes, x, y, size, color);
}
