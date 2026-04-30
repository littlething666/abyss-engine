import { describe, expect, it } from 'vitest';

import type { TopicLattice } from '@/types/topicLattice';

import { assembleSubjectGraph } from './assembleSubjectGraph';

const lattice: TopicLattice = {
  topics: [
    { topicId: 'a1', title: 'A1', iconName: 'atom', tier: 1, learningObjective: 'o' },
    { topicId: 'b1', title: 'B1', iconName: 'beaker', tier: 2, learningObjective: 'o' },
    { topicId: 'c1', title: 'C1', iconName: 'brain', tier: 3, learningObjective: 'o' },
  ],
};

describe('assembleSubjectGraph', () => {
  it('attaches edges and keeps tier 1 prerequisites empty', () => {
    const edges = {
      b1: ['a1'],
      c1: ['b1', { topicId: 'a1', minLevel: 2 }],
    };
    const graph = assembleSubjectGraph(lattice, edges, 'sub-1', 'Title');
    expect(graph.maxTier).toBe(3);
    expect(graph.nodes.map((n) => n.topicId)).toEqual(['a1', 'b1', 'c1']);
    expect(graph.nodes.find((n) => n.topicId === 'a1')?.prerequisites).toEqual([]);
    expect(graph.nodes.find((n) => n.topicId === 'b1')?.prerequisites).toEqual(['a1']);
    expect(graph.nodes.find((n) => n.topicId === 'c1')?.prerequisites).toEqual(edges.c1);
  });

  it('preserves iconName from lattice on every assembled graph node', () => {
    const graph = assembleSubjectGraph(lattice, {}, 'sub-1', 'Title');
    expect(graph.nodes.find((n) => n.topicId === 'a1')?.iconName).toBe('atom');
    expect(graph.nodes.find((n) => n.topicId === 'b1')?.iconName).toBe('beaker');
    expect(graph.nodes.find((n) => n.topicId === 'c1')?.iconName).toBe('brain');
  });
});
