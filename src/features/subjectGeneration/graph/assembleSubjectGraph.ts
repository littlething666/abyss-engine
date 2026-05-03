import type { GraphPrerequisiteEntry, SubjectGraph } from '@/types/core';
import type { TopicLattice } from '@/types/topicLattice';

import type { PrereqEdges } from './prereqWiring/prerequisiteEdgeRules';

/**
 * Merges Stage-A lattice with Stage-B edges into the canonical SubjectGraph shape
 * for `validateGraph`.
 *
 * Tier-stable sort: ascending tier, original lattice index within a tier.
 *
 * `iconName` is copied directly from the lattice node (already validated by
 * `topicLatticeSchema`). No fallback. Invalid icons must fail upstream at the
 * schema layer, not here.
 */
export function assembleSubjectGraph(
  lattice: TopicLattice,
  edges: PrereqEdges,
  subjectId: string,
  graphTitle: string,
): SubjectGraph {
  const order = new Map(lattice.topics.map((t, i) => [t.topicId, i] as const));
  const sorted = [...lattice.topics].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (order.get(a.topicId) ?? 0) - (order.get(b.topicId) ?? 0);
  });

  const maxTier = Math.max(...sorted.map((t) => t.tier), 1);

  const nodes = sorted.map((t) => {
    const prerequisites: GraphPrerequisiteEntry[] =
      t.tier === 1 ? [] : (edges[t.topicId] ?? ([] as GraphPrerequisiteEntry[]));
    return {
      topicId: t.topicId,
      title: t.title,
      iconName: t.iconName,
      tier: t.tier,
      prerequisites,
      learningObjective: t.learningObjective,
    };
  });

  return {
    subjectId,
    title: graphTitle,
    themeId: subjectId,
    maxTier,
    nodes,
  };
}
