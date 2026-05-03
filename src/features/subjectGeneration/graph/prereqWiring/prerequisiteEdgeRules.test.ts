import { describe, expect, it } from 'vitest';

import type { GraphStrategy } from '@/types/generationStrategy';
import type { TopicLattice } from '@/types/topicLattice';

import { createPrerequisiteEdgeRules } from './prerequisiteEdgeRules';

function makeLattice(opts?: {
  tier3Ids?: string[];
  tier1Count?: number;
  tier2Count?: number;
}): TopicLattice {
  const tier1Count = opts?.tier1Count ?? 2;
  const tier2Count = opts?.tier2Count ?? 2;
  const tier3Ids = opts?.tier3Ids ?? ['c1', 'c2'];
  const topics: TopicLattice['topics'] = [];
  for (let i = 1; i <= tier1Count; i += 1) {
    topics.push({
      topicId: `a${i}`,
      title: `A${i}`,
      tier: 1,
      learningObjective: 'o',
      iconName: 'lightbulb',
    });
  }
  for (let i = 1; i <= tier2Count; i += 1) {
    topics.push({
      topicId: `b${i}`,
      title: `B${i}`,
      tier: 2,
      learningObjective: 'o',
      iconName: 'lightbulb',
    });
  }
  for (const id of tier3Ids) {
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

function twoTierLattice(): TopicLattice {
  return {
    topics: [
      { topicId: 'a1', title: 'A1', tier: 1, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 'a2', title: 'A2', tier: 1, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 'b1', title: 'B1', tier: 2, learningObjective: 'o', iconName: 'lightbulb' },
      { topicId: 'b2', title: 'B2', tier: 2, learningObjective: 'o', iconName: 'lightbulb' },
    ],
  };
}

const baseStrategy: GraphStrategy = {
  totalTiers: 3,
  topicsPerTier: 2,
  audienceBrief: 'Aud',
  domainBrief: 'Dom',
  focusConstraints: '',
};

describe('createPrerequisiteEdgeRules — buildMessages', () => {
  it('includes authoritative tier id lists and required output shape', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice());
    const msgs = rules.buildMessages({
      subjectId: 's',
      subjectTitle: 'Subject',
      strategy: baseStrategy,
    });
    const sys = typeof msgs[0].content === 'string' ? msgs[0].content : '';
    expect(sys).toContain('Tier 1 ids');
    expect(sys).toContain('Tier 2 ids');
    expect(sys).toContain('Tier 3 ids');
    expect(sys).toContain('Required output shape');
    expect(sys).toContain('"edges"');
  });

  it('emits a same-tier negative example pinned to the lattice when ≥2 tier-3 topics', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1', 'c2', 'c3'] }));
    const msgs = rules.buildMessages({
      subjectId: 's',
      subjectTitle: 'Subject',
      strategy: baseStrategy,
    });
    const sys = typeof msgs[0].content === 'string' ? msgs[0].content : '';
    expect(sys).toContain('DO NOT list "c1"');
    expect(sys).toContain('"c2"');
  });

  it('falls back to abstract negative example when fewer than two tier-3 topics', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1'] }));
    const msgs = rules.buildMessages({
      subjectId: 's',
      subjectTitle: 'Subject',
      strategy: baseStrategy,
    });
    const sys = typeof msgs[0].content === 'string' ? msgs[0].content : '';
    expect(sys).toContain('do not connect two tier-3 topics');
    expect(sys).not.toContain('DO NOT list "');
  });

  it('emits 2-tier lattices without synthetic tier-3 ids', () => {
    const rules = createPrerequisiteEdgeRules(twoTierLattice());
    const msgs = rules.buildMessages({
      subjectId: 's',
      subjectTitle: 'Subject',
      strategy: baseStrategy,
    });
    const sys = typeof msgs[0].content === 'string' ? msgs[0].content : '';
    expect(sys).toContain('Tier 1 ids');
    expect(sys).toContain('Tier 2 ids');
    expect(sys).toMatch(/Tier 3 ids[\s\S]*\(none\)/);
  });
});

describe('createPrerequisiteEdgeRules — acceptModelResponse (success)', () => {
  it('accepts valid edges, preserves order, returns observation: null when no repair', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1', 'c2'] }));
    const raw = JSON.stringify({
      edges: {
        b1: ['a1'],
        b2: ['a2'],
        c1: ['b1', 'a1'],
        c2: ['b2', 'a2'],
      },
    });
    const result = rules.acceptModelResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edges.b1).toEqual(['a1']);
    expect(result.edges.c1).toEqual(['b1', 'a1']);
    expect(result.correction.removed).toEqual([]);
    expect(result.correction.added).toEqual([]);
    expect(result.observation).toBeNull();
  });

  it('removes same-tier tier-3 prerequisite, fills with deterministic tier-2 when needed', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1', 'c2'] }));
    const raw = JSON.stringify({
      edges: {
        b1: ['a1'],
        b2: ['a2'],
        c1: ['c2'],
        c2: ['b2'],
      },
    });
    const result = rules.acceptModelResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.correction.removed.some((r) => r.prereqId === 'c2')).toBe(true);
    expect(result.correction.added.some((a) => a.kind === 'filler-tier2')).toBe(true);
    const c1 = (result.edges.c1 ?? []).map((e) => (typeof e === 'string' ? e : e.topicId));
    expect(c1).toContain('b1');
  });

  it('fills empty tier-2 with the first tier-1 topic by lattice order', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1', 'c2'] }));
    const raw = JSON.stringify({
      edges: {
        b1: [],
        b2: ['a2'],
        c1: ['b1', 'a1'],
        c2: ['b2', 'a2'],
      },
    });
    const result = rules.acceptModelResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edges.b1).toEqual(['a1']);
    expect(
      result.correction.added.some((a) => a.topicId === 'b1' && a.kind === 'filler-tier1'),
    ).toBe(true);
  });

  it('fills tier-3 lacking any tier-2 prerequisite with the first tier-2 topic by order', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1', 'c2'] }));
    const raw = JSON.stringify({
      edges: {
        b1: ['a1'],
        b2: ['a2'],
        c1: ['a1', 'a2'],
        c2: ['b2'],
      },
    });
    const result = rules.acceptModelResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c1 = (result.edges.c1 ?? []).map((e) => (typeof e === 'string' ? e : e.topicId));
    expect(c1).toContain('b1');
    expect(
      result.correction.added.some((a) => a.topicId === 'c1' && a.kind === 'filler-tier2'),
    ).toBe(true);
  });

  it('preserves valid object entries with { topicId, minLevel }', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1', 'c2'] }));
    const raw = JSON.stringify({
      edges: {
        b1: [{ topicId: 'a1', minLevel: 2 }],
        b2: ['a2'],
        c1: [{ topicId: 'b1', minLevel: 3 }, 'a1'],
        c2: ['b2'],
      },
    });
    const result = rules.acceptModelResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edges.b1).toEqual([{ topicId: 'a1', minLevel: 2 }]);
    expect(result.edges.c1?.[0]).toEqual({ topicId: 'b1', minLevel: 3 });
  });

  it('dedupes duplicate prerequisite entries by id, preserving first occurrence', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1', 'c2'] }));
    const raw = JSON.stringify({
      edges: {
        b1: ['a1', 'a1', 'a2'],
        b2: ['a2'],
        c1: ['b1', 'b1', 'a1'],
        c2: ['b2'],
      },
    });
    const result = rules.acceptModelResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edges.b1).toEqual(['a1', 'a2']);
    expect(result.edges.c1).toEqual(['b1', 'a1']);
  });

  it('removes unknown prerequisite ids and reports them in correction.removed', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1', 'c2'] }));
    const raw = JSON.stringify({
      edges: {
        b1: ['a1', 'unknown-1'],
        b2: ['a2'],
        c1: ['b1', 'a1', 'mystery'],
        c2: ['b2'],
      },
    });
    const result = rules.acceptModelResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.correction.removed.some((r) => r.prereqId === 'unknown-1')).toBe(true);
    expect(result.correction.removed.some((r) => r.prereqId === 'mystery')).toBe(true);
  });

  it('builds a correction observation only when removed.length + added.length > 0', () => {
    const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1', 'c2'] }));
    const cleanRaw = JSON.stringify({
      edges: {
        b1: ['a1'],
        b2: ['a2'],
        c1: ['b1', 'a1'],
        c2: ['b2'],
      },
    });
    const clean = rules.acceptModelResponse(cleanRaw);
    expect(clean.ok).toBe(true);
    if (clean.ok) expect(clean.observation).toBeNull();

    const dirtyRaw = JSON.stringify({
      edges: {
        b1: [],
        b2: ['a2'],
        c1: ['b1', 'a1'],
        c2: ['b2'],
      },
    });
    const dirty = rules.acceptModelResponse(dirtyRaw);
    expect(dirty.ok).toBe(true);
    if (dirty.ok) {
      expect(dirty.observation).not.toBeNull();
      expect(dirty.observation?.eventFields.prereqEdgesCorrectionApplied).toBe(true);
      expect(dirty.observation?.consoleEvent.label).toBe('[subjectGraph] prereqEdgesCorrection');
      expect(dirty.observation?.metadata.prereqEdgesCorrection).toEqual(dirty.correction);
    }
  });
});

describe('createPrerequisiteEdgeRules — acceptModelResponse (failure)', () => {
  const rules = createPrerequisiteEdgeRules(makeLattice({ tier3Ids: ['c1', 'c2'] }));

  it('returns missing-json when no JSON found', () => {
    const r = rules.acceptModelResponse('no json here');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('missing-json');
  });

  it('returns invalid-json when JSON.parse throws on extracted span', () => {
    const r = rules.acceptModelResponse('{"edges": {b1: [a1]}}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-json');
  });

  it('returns missing-edges-object when JSON has no object-valued edges field', () => {
    const r = rules.acceptModelResponse(JSON.stringify({ notEdges: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('missing-edges-object');

    const r2 = rules.acceptModelResponse(JSON.stringify({ edges: 'not-an-object' }));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('missing-edges-object');
  });

  it('returns strict-validation-failed when repaired output still violates the contract', () => {
    const brokenLattice: TopicLattice = {
      topics: [
        { topicId: 'a1', title: 'A1', tier: 1, learningObjective: 'o', iconName: 'lightbulb' },
        { topicId: 'c1', title: 'C1', tier: 3, learningObjective: 'o', iconName: 'lightbulb' },
      ],
    };
    const brokenRules = createPrerequisiteEdgeRules(brokenLattice);
    const raw = JSON.stringify({ edges: { c1: ['a1'] } });
    const r = brokenRules.acceptModelResponse(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('strict-validation-failed');
  });
});
