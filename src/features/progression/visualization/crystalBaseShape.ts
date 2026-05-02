import { CRYSTAL_BASE_SHAPES, type CrystalBaseShape, type TopicRef } from '@/types/core';

import { topicSeedFromRef } from './seeds';

/**
 * Deterministically routes a topic to one of the four base polyhedrons in
 * {@link CRYSTAL_BASE_SHAPES}. Same topic always maps to the same shape;
 * subjects no longer carry shape identity (they communicate via color only).
 *
 * The `Math.min` clamp is a strategic guard against future seed-implementation
 * drift, not a runtime defensive fix — `topicSeedFromRef` always returns a
 * value in [0, 1).
 */
export function crystalBaseShapeFromTopicRef(ref: TopicRef): CrystalBaseShape {
  const bucket = Math.min(
    CRYSTAL_BASE_SHAPES.length - 1,
    Math.floor(topicSeedFromRef(ref) * CRYSTAL_BASE_SHAPES.length),
  );
  return CRYSTAL_BASE_SHAPES[bucket];
}
