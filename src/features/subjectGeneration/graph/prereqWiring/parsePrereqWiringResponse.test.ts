import { describe, expect, it } from 'vitest';

import type { TopicLattice } from '@/types/topicLattice';

import { parsePrereqWiringResponse } from './parsePrereqWiringResponse';

function miniLattice(): TopicLattice {
  return {
    topics: [
      { topicId: 'a1', title: 'A1', tier: 1, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 'a2', title: 'A2', tier: 1, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 'b1', title: 'B1', tier: 2, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 'b2', title: 'B2', tier: 2, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 'c1', title: 'C1', tier: 3, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 'c2', title: 'C2', tier: 3, learningObjective: 'o', iconName: 'lightbulb' },
    ],
  };
}

describe('parsePrereqWiringResponse', () => {
  it('returns ok after repair for same-tier tier-3 prerequisite', () => {
    const lattice = miniLattice();
    const raw = JSON.stringify({
      edges: {
        b1: ['a1'],
        b2: ['a2'],
        c1: ['b1', 'c2'],
        c2: ['b2', 'a1'],
      },
    });

    const result = parsePrereqWiringResponse(raw, lattice);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.correction.removed.some((r) => r.prereqId === 'c2')).toBe(true);
    expect(typeof result.edges.c1?.[0]).toBeTruthy();
  });
});
