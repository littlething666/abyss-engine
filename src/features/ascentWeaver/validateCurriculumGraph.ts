import type { SubjectGraph } from '../../types/core';

export interface CurriculumGraphExpectations {
  subjectId: string;
  themeId: string;
  topicCount: number;
  maxTier: number;
  topicsPerTier: number;
}

const kebabTopicId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ValidateCurriculumGraphResult = { ok: true } | { ok: false; error: string };

export function validateCurriculumGraph(
  graph: SubjectGraph,
  expectations: CurriculumGraphExpectations,
): ValidateCurriculumGraphResult {
  if (graph.subjectId !== expectations.subjectId) {
    return { ok: false, error: `subjectId mismatch: expected "${expectations.subjectId}", got "${graph.subjectId}"` };
  }
  if (graph.themeId !== expectations.themeId) {
    return { ok: false, error: `themeId mismatch: expected "${expectations.themeId}", got "${graph.themeId}"` };
  }
  if (graph.maxTier !== expectations.maxTier) {
    return { ok: false, error: `maxTier mismatch: expected ${expectations.maxTier}, got ${graph.maxTier}` };
  }

  const expectedTotal = expectations.topicCount;
  if (graph.nodes.length !== expectedTotal) {
    return { ok: false, error: `Expected ${expectedTotal} nodes, got ${graph.nodes.length}` };
  }

  const topicIdSet = new Map<string, { tier: number }>();
  for (const node of graph.nodes) {
    if (topicIdSet.has(node.topicId)) {
      return { ok: false, error: `Duplicate topicId: ${node.topicId}` };
    }
    if (!kebabTopicId.test(node.topicId)) {
      return { ok: false, error: `topicId must be lowercase kebab-case: ${node.topicId}` };
    }
    if (node.tier < 1 || node.tier > graph.maxTier) {
      return { ok: false, error: `Invalid tier ${node.tier} for topic ${node.topicId} (maxTier ${graph.maxTier})` };
    }
    topicIdSet.set(node.topicId, { tier: node.tier });
  }

  const countsByTier = new Map<number, number>();
  for (const node of graph.nodes) {
    countsByTier.set(node.tier, (countsByTier.get(node.tier) ?? 0) + 1);
  }
  for (let t = 1; t <= expectations.maxTier; t += 1) {
    const count = countsByTier.get(t) ?? 0;
    if (count !== expectations.topicsPerTier) {
      return {
        ok: false,
        error: `Tier ${t} must have exactly ${expectations.topicsPerTier} topics, got ${count}`,
      };
    }
  }

  for (const node of graph.nodes) {
    if (node.tier === 1) {
      if (node.prerequisites.length > 0) {
        return { ok: false, error: `Tier 1 topic ${node.topicId} must have empty prerequisites` };
      }
      continue;
    }

    if (node.prerequisites.length === 0) {
      return { ok: false, error: `Topic ${node.topicId} (tier ${node.tier}) must list prerequisites` };
    }

    let hasImmediateLowerTier = false;
    for (const prereqId of node.prerequisites) {
      const prereq = topicIdSet.get(prereqId);
      if (!prereq) {
        return { ok: false, error: `Unknown prerequisite "${prereqId}" on topic ${node.topicId}` };
      }
      if (prereq.tier >= node.tier) {
        return {
          ok: false,
          error: `Prerequisite "${prereqId}" (tier ${prereq.tier}) must be from a lower tier than ${node.topicId} (tier ${node.tier})`,
        };
      }
      if (prereq.tier === node.tier - 1) {
        hasImmediateLowerTier = true;
      }
    }

    if (node.tier >= 3 && !hasImmediateLowerTier) {
      return {
        ok: false,
        error: `Topic ${node.topicId} (tier ${node.tier}) must include at least one prerequisite from tier ${node.tier - 1}`,
      };
    }
  }

  return { ok: true };
}
