import type { TopicRef } from '@/types/core';
import { topicRefKey } from '@/lib/topicRef';

/**
 * Deterministic 0–1 seed for procedural noise from subject id.
 *
 * FNV-1a hash; mirrors {@link topicSeedFromRef}. Lives in this module —
 * not in `crystalMorphModel.ts` — so shape selection (`crystalBaseShape.ts`)
 * does not pull in morph/tier logic. Returns 0.5 when the id is missing.
 */
export function subjectSeedFromId(subjectId: string | null | undefined): number {
  if (!subjectId) {
    return 0.5;
  }
  let h = 2166136261;
  for (let i = 0; i < subjectId.length; i++) {
    h ^= subjectId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Deterministic 0–1 seed for per-topic procedural variation.
 *
 * FNV-1a hash over `topicRefKey(ref)`; mirrors {@link subjectSeedFromId}
 * exactly so the two seed channels share statistical properties. Pure
 * function — no `Math.random()`, no global state.
 */
export function topicSeedFromRef(ref: TopicRef): number {
  const key = topicRefKey(ref);
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
