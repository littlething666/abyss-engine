import { normalizeGraphPrerequisites } from '@/lib/graphPrerequisites';
import type { SubjectGraph } from '@/types/core';

/**
 * Subject graph validation — STRICT terminal gate on the fully assembled graph.
 *
 * The backend Subject Graph Stage B path owns prompt construction, strict parsing,
 * and semantic validation. This frontend helper validates an already-assembled
 * canonical `SubjectGraph` only; it does not repair model output.
 */

export interface GraphValidationExpectations {
  subjectId: string;
  themeId: string;
  topicCount: number;
  maxTier: number;
  topicsPerTier: number;
}

const kebabTopicId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ValidateGraphResult = { ok: true } | { ok: false; error: string };

/**
 * Validates a fully assembled `SubjectGraph` (topics + prerequisites). This is the terminal
 * gate for curriculum structure; invalid graphs must fail explicitly—do not add downstream
 * repair or silent coercion (see `plans/plan_curriculum_two_stage_generation_20260421_114002.md`).
 */
export function validateGraph(graph: SubjectGraph, expectations: GraphValidationExpectations): ValidateGraphResult {
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
    const prereqsNorm = normalizeGraphPrerequisites(node.prerequisites);

    if (node.tier === 1) {
      if (prereqsNorm.length > 0) {
        return { ok: false, error: `Tier 1 topic ${node.topicId} must have empty prerequisites` };
      }
      continue;
    }

    if (prereqsNorm.length === 0) {
      return { ok: false, error: `Topic ${node.topicId} (tier ${node.tier}) must list prerequisites` };
    }

    let hasImmediateLowerTier = false;
    for (const { topicId: prereqId } of prereqsNorm) {
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
