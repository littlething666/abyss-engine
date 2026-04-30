import { describe, expect, it } from 'vitest';

import type { TopicLattice } from '@/types/topicLattice';

import { validateTopicLattice } from './validateTopicLattice';

function makeLattice(topics: TopicLattice['topics']): TopicLattice {
  return { topics };
}

describe('validateTopicLattice', () => {
  const expectations = { maxTier: 3, topicsPerTier: 5 };

  it('accepts a balanced 3×5 lattice', () => {
    const topics: TopicLattice['topics'] = [];
    for (let i = 1; i <= 5; i += 1) {
      topics.push({
        topicId: `t1-${i}`,
        title: `T1 ${i}`,
        tier: 1,
        learningObjective: 'Obj.',
        iconName: 'lightbulb',
      });
    }
    for (let i = 1; i <= 5; i += 1) {
      topics.push({
        topicId: `t2-${i}`,
        title: `T2 ${i}`,
        tier: 2,
        learningObjective: 'Obj.',
        iconName: 'lightbulb',
      });
    }
    for (let i = 1; i <= 5; i += 1) {
      topics.push({
        topicId: `t3-${i}`,
        title: `T3 ${i}`,
        tier: 3,
        learningObjective: 'Obj.',
        iconName: 'lightbulb',
      });
    }
    expect(validateTopicLattice(makeLattice(topics), expectations)).toEqual({ ok: true });
  });

  it('rejects wrong total count', () => {
    const topics: TopicLattice['topics'] = [
      { topicId: 'a', title: 'A', tier: 1, learningObjective: 'x', iconName: 'lightbulb' },
    ];
    const r = validateTopicLattice(makeLattice(topics), expectations);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Expected 15 topics');
  });

  it('rejects duplicate topic ids', () => {
    const topics: TopicLattice['topics'] = [];
    for (let i = 1; i <= 5; i += 1) {
      topics.push({ topicId: 'dup-id', title: 'x', tier: 1, learningObjective: 'o', iconName: 'lightbulb' });
    }
    for (let i = 1; i <= 5; i += 1) {
      topics.push({ topicId: `t2-${i}`, title: 'x', tier: 2, learningObjective: 'o', iconName: 'lightbulb' });
    }
    for (let i = 1; i <= 5; i += 1) {
      topics.push({ topicId: `t3-${i}`, title: 'x', tier: 3, learningObjective: 'o', iconName: 'lightbulb' });
    }
    const r = validateTopicLattice(makeLattice(topics), expectations);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Duplicate');
  });

  it('rejects wrong per-tier counts', () => {
    const topics: TopicLattice['topics'] = [];
    for (let i = 1; i <= 6; i += 1) {
      topics.push({ topicId: `t1-${i}`, title: 'x', tier: 1, learningObjective: 'o', iconName: 'lightbulb' });
    }
    for (let i = 1; i <= 4; i += 1) {
      topics.push({ topicId: `t2-${i}`, title: 'x', tier: 2, learningObjective: 'o', iconName: 'lightbulb' });
    }
    for (let i = 1; i <= 5; i += 1) {
      topics.push({ topicId: `t3-${i}`, title: 'x', tier: 3, learningObjective: 'o', iconName: 'lightbulb' });
    }
    const r = validateTopicLattice(makeLattice(topics), expectations);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Tier [12]/);
  });
});
