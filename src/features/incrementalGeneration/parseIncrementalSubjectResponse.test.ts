import { describe, expect, it } from 'vitest';

import { parseIncrementalSubjectResponse } from './parseIncrementalSubjectResponse';

const minimalGraph = {
  subjectId: 'demo-subject',
  title: 'Demo',
  themeId: 'demo-subject',
  maxTier: 2,
  nodes: [] as {
    topicId: string;
    title: string;
    tier: number;
    prerequisites: string[];
    learningObjective: string;
  }[],
};

for (let i = 1; i <= 5; i += 1) {
  minimalGraph.nodes.push({
    topicId: `t1-${i}`,
    title: `T1 ${i}`,
    tier: 1,
    prerequisites: [],
    learningObjective: 'Objective.',
  });
}
for (let i = 1; i <= 5; i += 1) {
  minimalGraph.nodes.push({
    topicId: `t2-${i}`,
    title: `T2 ${i}`,
    tier: 2,
    prerequisites: [`t1-${i}`],
    learningObjective: 'Objective.',
  });
}

describe('parseIncrementalSubjectResponse', () => {
  it('parses subject + graph JSON', () => {
    const raw = JSON.stringify({
      subject: {
        name: 'Demo',
        description: 'Desc',
        color: '#112233',
        geometry: { gridTile: 'box' },
      },
      graph: minimalGraph,
    });

    const r = parseIncrementalSubjectResponse(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subject.name).toBe('Demo');
      expect(r.graph.maxTier).toBe(2);
      expect(r.graph.nodes).toHaveLength(10);
    }
  });
});
