import { describe, expect, it } from 'vitest';

import type { TopicLattice } from '@/types/topicLattice';

import { buildPrereqEdgesSchema } from './prereqWiringSchema';
import { correctPrereqEdges } from './correctPrereqEdges';

function fifteenNodeLattice(): TopicLattice {
  const topics: TopicLattice['topics'] = [];
  for (let i = 1; i <= 5; i += 1) {
    topics.push({
      topicId: `t1-${i}`,
      title: `T1 ${i}`,
      tier: 1,
      learningObjective: 'o',
      iconName: 'lightbulb',
    });
  }
  for (let i = 1; i <= 5; i += 1) {
    topics.push({
      topicId: `t2-${i}`,
      title: `T2 ${i}`,
      tier: 2,
      learningObjective: 'o',
      iconName: 'lightbulb',
    });
  }
  const t3Ids = [
    'radix-2-fft-algorithm',
    'butterfly-diagram-analysis',
    't3-3',
    't3-4',
    't3-5',
  ];
  for (const id of t3Ids) {
    topics.push({
      topicId: id,
      title: id,
      tier: 3,
      learningObjective: 'o',
      iconName: 'lightbulb',
    });
  }
  return { topics };
}

describe('correctPrereqEdges', () => {
  it('removes tier-3–to–tier-3 prerequisite and passes strict schema', () => {
    const lattice = fifteenNodeLattice();
    const edges: Record<string, unknown[]> = {};
    for (let i = 1; i <= 5; i += 1) {
      edges[`t2-${i}`] = [`t1-${i}`];
    }
    edges['radix-2-fft-algorithm'] = ['t2-1', 't1-1'];
    edges['butterfly-diagram-analysis'] = ['radix-2-fft-algorithm', 't1-1'];
    edges['t3-3'] = ['t2-3', 't1-1'];
    edges['t3-4'] = ['t2-4', 't1-1'];
    edges['t3-5'] = ['t2-5', 't1-1'];

    const { edges: fixed, correction } = correctPrereqEdges(lattice, edges);

    expect(correction.removed.some((r) => r.prereqId === 'radix-2-fft-algorithm')).toBe(true);
    expect(correction.added.some((a) => a.kind === 'filler-tier2')).toBe(true);

    const schema = buildPrereqEdgesSchema(lattice);
    expect(schema.safeParse({ edges: fixed }).success).toBe(true);
  });

  it('fills empty tier-2 topic with first tier-1 id', () => {
    const lattice = fifteenNodeLattice();
    const edges: Record<string, unknown[]> = {};
    for (let i = 1; i <= 5; i += 1) {
      edges[`t2-${i}`] = i === 1 ? [] : [`t1-${i}`];
    }
    edges['radix-2-fft-algorithm'] = ['t2-1', 't1-1'];
    edges['butterfly-diagram-analysis'] = ['t2-2', 't1-1'];
    edges['t3-3'] = ['t2-3', 't1-1'];
    edges['t3-4'] = ['t2-4', 't1-1'];
    edges['t3-5'] = ['t2-5', 't1-1'];

    const { edges: fixed, correction } = correctPrereqEdges(lattice, edges);

    expect(fixed['t2-1']).toEqual(['t1-1']);
    expect(correction.added.some((a) => a.topicId === 't2-1' && a.kind === 'filler-tier1')).toBe(true);

    const schema = buildPrereqEdgesSchema(lattice);
    expect(schema.safeParse({ edges: fixed }).success).toBe(true);
  });
});
