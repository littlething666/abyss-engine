import { describe, expect, it } from 'vitest';

import type { TopicLattice } from '@/types/topicLattice';

import { buildPrereqEdgesSchema } from './prereqWiringSchema';

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

describe('buildPrereqEdgesSchema', () => {
  it('accepts valid wiring', () => {
    const lattice = fifteenNodeLattice();
    const edges: Record<string, unknown[]> = {};
    for (let i = 1; i <= 5; i += 1) {
      edges[`t2-${i}`] = [`t1-${i}`];
    }
    edges['radix-2-fft-algorithm'] = ['t2-1', 't1-1'];
    edges['butterfly-diagram-analysis'] = ['t2-2', 't1-1'];
    edges['t3-3'] = ['t2-3', 't1-1'];
    edges['t3-4'] = ['t2-4', 't1-1'];
    edges['t3-5'] = ['t2-5', 't1-1'];

    const schema = buildPrereqEdgesSchema(lattice);
    const r = schema.safeParse({ edges });
    expect(r.success).toBe(true);
  });

  it('rejects butterfly-diagram-analysis depending on radix-2-fft-algorithm (both tier 3)', () => {
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

    const schema = buildPrereqEdgesSchema(lattice);
    const r = schema.safeParse({ edges });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('tier-3'))).toBe(true);
    }
  });

  it('rejects tier-3 key missing tier-2 prerequisite', () => {
    const lattice = fifteenNodeLattice();
    const edges: Record<string, unknown[]> = {};
    for (let i = 1; i <= 5; i += 1) {
      edges[`t2-${i}`] = [`t1-${i}`];
    }
    edges['radix-2-fft-algorithm'] = ['t1-1', 't1-2'];
    edges['butterfly-diagram-analysis'] = ['t2-2', 't1-1'];
    edges['t3-3'] = ['t2-3', 't1-1'];
    edges['t3-4'] = ['t2-4', 't1-1'];
    edges['t3-5'] = ['t2-5', 't1-1'];

    const schema = buildPrereqEdgesSchema(lattice);
    const r = schema.safeParse({ edges });
    expect(r.success).toBe(false);
  });

  it('rejects tier-2 magnitude-and-phase-spectra referencing tier-2 dft-mathematical-definition (regression)', () => {
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
    topics.push(
      { topicId: 't2-1', title: 'T2 1', tier: 2, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 't2-2', title: 'T2 2', tier: 2, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 't2-3', title: 'T2 3', tier: 2, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 'magnitude-and-phase-spectra', title: 'Mag', tier: 2, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 'dft-mathematical-definition', title: 'DFT', tier: 2, learningObjective: 'o', iconName: 'lightbulb' },
    );
    for (let i = 1; i <= 5; i += 1) {
      topics.push({
        topicId: `t3-${i}`,
        title: `T3 ${i}`,
        tier: 3,
        learningObjective: 'o',
        iconName: 'lightbulb',
      });
    }
    const lattice: TopicLattice = { topics };

    const edges: Record<string, unknown[]> = {};
    edges['t2-1'] = ['t1-1'];
    edges['t2-2'] = ['t1-2'];
    edges['t2-3'] = ['t1-3'];
    edges['dft-mathematical-definition'] = ['t1-4'];
    edges['magnitude-and-phase-spectra'] = ['dft-mathematical-definition'];
    edges['t3-1'] = ['t2-1', 't1-1'];
    edges['t3-2'] = ['t2-2', 't1-1'];
    edges['t3-3'] = ['t2-3', 't1-1'];
    edges['t3-4'] = ['magnitude-and-phase-spectra', 't1-1'];
    edges['t3-5'] = ['dft-mathematical-definition', 't1-1'];

    const schema = buildPrereqEdgesSchema(lattice);
    const r = schema.safeParse({ edges });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some(
          (i) =>
            i.message.includes('magnitude-and-phase-spectra') &&
            i.message.includes('dft-mathematical-definition'),
        ),
      ).toBe(true);
    }
  });
});
