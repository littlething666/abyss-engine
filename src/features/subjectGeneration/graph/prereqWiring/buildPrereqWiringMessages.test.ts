import { describe, expect, it } from 'vitest';

import type { GraphStrategy } from '@/types/generationStrategy';
import type { TopicLattice } from '@/types/topicLattice';

import { buildPrereqWiringMessages } from './buildPrereqWiringMessages';

describe('buildPrereqWiringMessages', () => {
  const strategy: GraphStrategy = {
    totalTiers: 3,
    topicsPerTier: 5,
    audienceBrief: 'Aud',
    domainBrief: 'Dom',
    focusConstraints: '',
  };

  it('injects tier allow-lists and pinned tier-3 negative example when ≥2 tier-3 topics', () => {
    const lattice: TopicLattice = {
      topics: [
        ...Array.from({ length: 5 }, (_, i) => ({
          topicId: `a-${i}`,
          title: 'a',
          tier: 1,
          learningObjective: 'o',
          iconName: 'lightbulb' as const,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          topicId: `b-${i}`,
          title: 'b',
          tier: 2,
          learningObjective: 'o',
          iconName: 'lightbulb' as const,
        })),
        { topicId: 'third-a', title: 'x', tier: 3, learningObjective: 'o', iconName: 'lightbulb' },
        { topicId: 'third-b', title: 'y', tier: 3, learningObjective: 'o', iconName: 'lightbulb' },
        { topicId: 'third-c', title: 'z', tier: 3, learningObjective: 'o', iconName: 'lightbulb' },
        { topicId: 'third-d', title: 'w', tier: 3, learningObjective: 'o', iconName: 'lightbulb' },
        { topicId: 'third-e', title: 'v', tier: 3, learningObjective: 'o', iconName: 'lightbulb' },
      ],
    };
    const msgs = buildPrereqWiringMessages('sid', 'My subject', strategy, lattice);
    const sys = typeof msgs[0].content === 'string' ? msgs[0].content : '';
    expect(sys).toContain('Tier 1 ids');
    expect(sys).toContain('Tier 2 ids');
    expect(sys).toContain('Tier 3 ids');
    expect(sys).toContain('DO NOT list "third-a"');
    expect(sys).toContain('"third-b"');
  });

  it('uses abstract negative example when fewer than two tier-3 topics', () => {
    const lattice: TopicLattice = {
      topics: [
        { topicId: 'a1', title: 'a', tier: 1, learningObjective: 'o', iconName: 'lightbulb' },
        { topicId: 'b1', title: 'b', tier: 2, learningObjective: 'o', iconName: 'lightbulb' },
        { topicId: 'c1', title: 'c', tier: 3, learningObjective: 'o', iconName: 'lightbulb' },
      ],
    };
    const msgs = buildPrereqWiringMessages('sid', 'S', { ...strategy, totalTiers: 3, topicsPerTier: 1 }, lattice);
    const sys = typeof msgs[0].content === 'string' ? msgs[0].content : '';
    expect(sys).toContain('do not connect two tier-3 topics');
    expect(sys).not.toContain('DO NOT list "');
  });
});
