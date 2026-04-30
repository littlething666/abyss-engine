import { describe, expect, it } from 'vitest';

import type { SubjectGraph } from '@/types/core';

import { validateGraph } from './validateGraph';

function buildFifteenNodeGraph(subjectId: string): SubjectGraph {
  const nodes: SubjectGraph['nodes'] = [];
  for (let i = 1; i <= 5; i += 1) {
    nodes.push({
      topicId: `t1-${i}`,
      title: `Tier 1 topic ${i}`,
      tier: 1,
      prerequisites: [],
      learningObjective: 'Objective one.',
      iconName: 'lightbulb',
    });
  }
  for (let i = 1; i <= 5; i += 1) {
    nodes.push({
      topicId: `t2-${i}`,
      title: `Tier 2 topic ${i}`,
      tier: 2,
      prerequisites: [`t1-${i}`],
      learningObjective: 'Objective two.',
      iconName: 'lightbulb',
    });
  }
  for (let i = 1; i <= 5; i += 1) {
    nodes.push({
      topicId: `t3-${i}`,
      title: `Tier 3 topic ${i}`,
      tier: 3,
      prerequisites: [`t2-${i}`, `t1-${i}`],
      learningObjective: 'Objective three.',
      iconName: 'lightbulb',
    });
  }
  return {
    subjectId,
    title: 'Test curriculum',
    themeId: subjectId,
    maxTier: 3,
    nodes,
  };
}

const expectations = {
  subjectId: 'demo-subject',
  themeId: 'demo-subject',
  topicCount: 15,
  maxTier: 3,
  topicsPerTier: 5,
};

describe('validateGraph', () => {
  it('accepts a well-formed 15-node graph', () => {
    const graph = buildFifteenNodeGraph('demo-subject');
    expect(validateGraph(graph, expectations)).toEqual({ ok: true });
  });

  it('rejects subjectId mismatch', () => {
    const graph = buildFifteenNodeGraph('wrong-id');
    const r = validateGraph(graph, expectations);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('subjectId');
    }
  });

  it('rejects tier 1 with prerequisites', () => {
    const graph = buildFifteenNodeGraph('demo-subject');
    graph.nodes[0].prerequisites = ['t1-2'];
    const r = validateGraph(graph, expectations);
    expect(r.ok).toBe(false);
  });

  it('rejects tier 3 without a tier-2 prerequisite', () => {
    const graph = buildFifteenNodeGraph('demo-subject');
    const t3 = graph.nodes.find((n) => n.topicId === 't3-1');
    expect(t3).toBeDefined();
    if (t3) {
      t3.prerequisites = ['t1-1'];
    }
    const r = validateGraph(graph, expectations);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('tier 2');
    }
  });

  it('rejects wrong per-tier counts', () => {
    const graph = buildFifteenNodeGraph('demo-subject');
    graph.nodes[5].tier = 1;
    const r = validateGraph(graph, expectations);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Tier 1');
    }
  });

  it('rejects invalid kebab topicId', () => {
    const graph = buildFifteenNodeGraph('demo-subject');
    graph.nodes[0].topicId = 'Bad_Id';
    const r = validateGraph(graph, expectations);
    expect(r.ok).toBe(false);
  });

  it('accepts a 10-node two-tier graph', () => {
    const nodes: SubjectGraph['nodes'] = [];
    for (let i = 1; i <= 5; i += 1) {
      nodes.push({
        topicId: `x1-${i}`,
        title: `Tier 1 ${i}`,
        tier: 1,
        prerequisites: [],
        learningObjective: 'Objective.',
        iconName: 'lightbulb',
      });
    }
    for (let i = 1; i <= 5; i += 1) {
      nodes.push({
        topicId: `x2-${i}`,
        title: `Tier 2 ${i}`,
        tier: 2,
        prerequisites: [`x1-${i}`],
        learningObjective: 'Objective.',
        iconName: 'lightbulb',
      });
    }
    const graph: SubjectGraph = {
      subjectId: 'demo-subject',
      title: 'Two tiers',
      themeId: 'demo-subject',
      maxTier: 2,
      nodes,
    };
    const r = validateGraph(graph, {
      subjectId: 'demo-subject',
      themeId: 'demo-subject',
      topicCount: 10,
      maxTier: 2,
      topicsPerTier: 5,
    });
    expect(r).toEqual({ ok: true });
  });
});
