import { describe, expect, it } from 'vitest';

import type { SubjectGraph } from '@/types/core';

import {
  buildSubjectGraphsForceGraphData,
  clusterCentersOnCircle,
  compositeTopicNodeId,
  computeTopicGraphBfsDistances,
  filterSubjectGraphsForceGraphDataByMaxHop,
  getMaxBfsDepthFromSeeds,
  getSelectableMaxHop,
  resolveEffectiveTopicGraphDistances,
} from './subjectGraphsForceGraphData';

describe('buildSubjectGraphsForceGraphData', () => {
  it('keeps distinct nodes when the same topicId appears in different subjects', () => {
    const graphs: SubjectGraph[] = [
      {
        subjectId: 'sub-a',
        title: 'A',
        themeId: 't',
        maxTier: 1,
        nodes: [
          {
            topicId: 'shared-slug',
            title: 'In A',
            tier: 1,
            prerequisites: [],
            learningObjective: 'o',
            iconName: 'lightbulb',
          },
        ],
      },
      {
        subjectId: 'sub-b',
        title: 'B',
        themeId: 't',
        maxTier: 1,
        nodes: [
          {
            topicId: 'shared-slug',
            title: 'In B',
            tier: 1,
            prerequisites: [],
            learningObjective: 'o',
            iconName: 'lightbulb',
          },
        ],
      },
    ];

    const { nodes, links, subjectIdsOrdered } = buildSubjectGraphsForceGraphData(graphs);

    expect(subjectIdsOrdered).toEqual(['sub-a', 'sub-b']);
    expect(nodes).toHaveLength(2);
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.size).toBe(2);
    expect(ids.has(compositeTopicNodeId('sub-a', 'shared-slug'))).toBe(true);
    expect(ids.has(compositeTopicNodeId('sub-b', 'shared-slug'))).toBe(true);
    expect(links).toHaveLength(0);
  });

  it('creates prerequisite links with composite endpoints within a subject', () => {
    const graphs: SubjectGraph[] = [
      {
        subjectId: 'math',
        title: 'Math',
        themeId: 'math',
        maxTier: 2,
        nodes: [
          {
            topicId: 'algebra',
            title: 'Algebra',
            tier: 1,
            prerequisites: [],
            learningObjective: 'a',
            iconName: 'lightbulb',
          },
          {
            topicId: 'calculus',
            title: 'Calculus',
            tier: 2,
            prerequisites: ['algebra'],
            learningObjective: 'c',
            iconName: 'lightbulb',
          },
        ],
      },
    ];

    const { nodes, links } = buildSubjectGraphsForceGraphData(graphs);

    expect(nodes).toHaveLength(2);
    expect(links).toEqual([
      {
        source: compositeTopicNodeId('math', 'algebra'),
        target: compositeTopicNodeId('math', 'calculus'),
      },
    ]);
  });

  it('drops links when prerequisite id is missing from nodes', () => {
    const graphs: SubjectGraph[] = [
      {
        subjectId: 's',
        title: 'S',
        themeId: 's',
        maxTier: 1,
        nodes: [
          {
            topicId: 'orphan-child',
            title: 'Child',
            tier: 2,
            prerequisites: ['missing-prereq'],
            learningObjective: 'x',
            iconName: 'lightbulb',
          },
        ],
      },
    ];

    const { links } = buildSubjectGraphsForceGraphData(graphs);
    expect(links).toHaveLength(0);
  });
});

describe('computeTopicGraphBfsDistances', () => {
  const chainGraph: SubjectGraph[] = [
    {
      subjectId: 'math',
      title: 'Math',
      themeId: 'math',
      maxTier: 3,
      nodes: [
        {
          topicId: 'a',
          title: 'A',
          tier: 1,
          prerequisites: [],
          learningObjective: '',
          iconName: 'lightbulb',
        },
        {
          topicId: 'b',
          title: 'B',
          tier: 2,
          prerequisites: ['a'],
          learningObjective: '',
          iconName: 'lightbulb',
        },
        {
          topicId: 'c',
          title: 'C',
          tier: 3,
          prerequisites: ['b'],
          learningObjective: '',
          iconName: 'lightbulb',
        },
      ],
    },
  ];

  it('assigns distances along a chain from unlocked seed', () => {
    const data = buildSubjectGraphsForceGraphData(chainGraph);
    const { distances } = computeTopicGraphBfsDistances(data, [compositeTopicNodeId('math', 'a')]);
    const idA = compositeTopicNodeId('math', 'a');
    const idB = compositeTopicNodeId('math', 'b');
    const idC = compositeTopicNodeId('math', 'c');
    expect(distances.get(idA)).toBe(0);
    expect(distances.get(idB)).toBe(1);
    expect(distances.get(idC)).toBe(2);
  });

  it('uses indegree-0 roots as seeds when no topic matches unlocked list', () => {
    const data = buildSubjectGraphsForceGraphData(chainGraph);
    const { distances, seedIds } = computeTopicGraphBfsDistances(data, []);
    const idA = compositeTopicNodeId('math', 'a');
    expect(seedIds).toContain(idA);
    expect(distances.get(idA)).toBe(0);
    expect(distances.get(compositeTopicNodeId('math', 'b'))).toBe(1);
  });

  it('does not assign distance to unreachable nodes in a disjoint second root', () => {
    const graphs: SubjectGraph[] = [
      {
        subjectId: 's',
        title: 'S',
        themeId: 's',
        maxTier: 1,
        nodes: [
          { topicId: 'x', title: 'X', tier: 1, prerequisites: [], learningObjective: '', iconName: 'lightbulb' },
          { topicId: 'y', title: 'Y', tier: 1, prerequisites: [], learningObjective: '', iconName: 'lightbulb' },
        ],
      },
    ];
    const data = buildSubjectGraphsForceGraphData(graphs);
    const { distances } = computeTopicGraphBfsDistances(data, [compositeTopicNodeId('s', 'x')]);
    expect(distances.has(compositeTopicNodeId('s', 'x'))).toBe(true);
    expect(distances.has(compositeTopicNodeId('s', 'y'))).toBe(false);
  });

  it('only unlocks the matching composite node when same topicId exists in two subjects', () => {
    const graphs: SubjectGraph[] = [
      {
        subjectId: 'sub-a',
        title: 'A',
        themeId: 't',
        maxTier: 1,
        nodes: [
          { topicId: 'shared', title: 'In A', tier: 1, prerequisites: [], learningObjective: '', iconName: 'lightbulb' },
        ],
      },
      {
        subjectId: 'sub-b',
        title: 'B',
        themeId: 't',
        maxTier: 1,
        nodes: [
          { topicId: 'shared', title: 'In B', tier: 1, prerequisites: [], learningObjective: '', iconName: 'lightbulb' },
        ],
      },
    ];
    const data = buildSubjectGraphsForceGraphData(graphs);
    const { distances } = computeTopicGraphBfsDistances(data, [compositeTopicNodeId('sub-a', 'shared')]);
    expect(distances.size).toBe(1);
    expect(distances.get(compositeTopicNodeId('sub-a', 'shared'))).toBe(0);
  });
});

describe('filterSubjectGraphsForceGraphDataByMaxHop', () => {
  const chainGraph: SubjectGraph[] = [
    {
      subjectId: 'math',
      title: 'Math',
      themeId: 'math',
      maxTier: 3,
      nodes: [
        { topicId: 'a', title: 'A', tier: 1, prerequisites: [], learningObjective: '', iconName: 'lightbulb' },
        { topicId: 'b', title: 'B', tier: 2, prerequisites: ['a'], learningObjective: '', iconName: 'lightbulb' },
        { topicId: 'c', title: 'C', tier: 3, prerequisites: ['b'], learningObjective: '', iconName: 'lightbulb' },
      ],
    },
  ];

  it('keeps a,b,c and links when maxHop is 2 and seed is a', () => {
    const data = buildSubjectGraphsForceGraphData(chainGraph);
    const { distances } = computeTopicGraphBfsDistances(data, [compositeTopicNodeId('math', 'a')]);
    const filtered = filterSubjectGraphsForceGraphDataByMaxHop(data, distances, 2);
    expect(filtered.nodes).toHaveLength(3);
    expect(filtered.links).toHaveLength(2);
    expect(filtered.subjectIdsOrdered).toEqual(['math']);
  });

  it('drops c when maxHop is 1', () => {
    const data = buildSubjectGraphsForceGraphData(chainGraph);
    const { distances } = computeTopicGraphBfsDistances(data, [compositeTopicNodeId('math', 'a')]);
    const filtered = filterSubjectGraphsForceGraphDataByMaxHop(data, distances, 1);
    expect(filtered.nodes.map((n) => n.topicId).sort()).toEqual(['a', 'b']);
    expect(filtered.links).toHaveLength(1);
  });
});

describe('resolveEffectiveTopicGraphDistances', () => {
  it('assigns distance 1 to locked entry topics unreachable from unlocked-only BFS', () => {
    const graphs: SubjectGraph[] = [
      {
        subjectId: 'math',
        title: 'Math',
        themeId: 'math',
        maxTier: 2,
        nodes: [
          {
            topicId: 'intro',
            title: 'Intro',
            tier: 1,
            prerequisites: [],
            learningObjective: '',
            iconName: 'lightbulb',
          },
          {
            topicId: 'advanced',
            title: 'Advanced',
            tier: 2,
            prerequisites: ['intro'],
            learningObjective: '',
            iconName: 'lightbulb',
          },
        ],
      },
    ];
    const data = buildSubjectGraphsForceGraphData(graphs);
    const idAdv = compositeTopicNodeId('math', 'advanced');
    const { distances } = computeTopicGraphBfsDistances(data, [idAdv]);
    const effective = resolveEffectiveTopicGraphDistances(data, [idAdv], distances);
    const idIntro = compositeTopicNodeId('math', 'intro');
    expect(distances.has(idIntro)).toBe(false);
    expect(effective.get(idIntro)).toBe(1);
    expect(effective.get(idAdv)).toBe(0);
  });

  it('does not override BFS distance for locked entry topics that are seeds when nothing is unlocked', () => {
    const graphs: SubjectGraph[] = [
      {
        subjectId: 'math',
        title: 'Math',
        themeId: 'math',
        maxTier: 2,
        nodes: [
          {
            topicId: 'intro',
            title: 'Intro',
            tier: 1,
            prerequisites: [],
            learningObjective: '',
            iconName: 'lightbulb',
          },
          {
            topicId: 'advanced',
            title: 'Advanced',
            tier: 2,
            prerequisites: ['intro'],
            learningObjective: '',
            iconName: 'lightbulb',
          },
        ],
      },
    ];
    const data = buildSubjectGraphsForceGraphData(graphs);
    const { distances } = computeTopicGraphBfsDistances(data, []);
    const effective = resolveEffectiveTopicGraphDistances(data, [], distances);
    expect(effective.get(compositeTopicNodeId('math', 'intro'))).toBe(0);
    expect(effective.get(compositeTopicNodeId('math', 'advanced'))).toBe(1);
  });

  it('includes locked entry at effective distance 1 when filtering maxHop 1', () => {
    const graphs: SubjectGraph[] = [
      {
        subjectId: 'math',
        title: 'Math',
        themeId: 'math',
        maxTier: 2,
        nodes: [
          {
            topicId: 'intro',
            title: 'Intro',
            tier: 1,
            prerequisites: [],
            learningObjective: '',
            iconName: 'lightbulb',
          },
          {
            topicId: 'advanced',
            title: 'Advanced',
            tier: 2,
            prerequisites: ['intro'],
            learningObjective: '',
            iconName: 'lightbulb',
          },
        ],
      },
    ];
    const data = buildSubjectGraphsForceGraphData(graphs);
    const idAdv = compositeTopicNodeId('math', 'advanced');
    const { distances } = computeTopicGraphBfsDistances(data, [idAdv]);
    const effective = resolveEffectiveTopicGraphDistances(data, [idAdv], distances);
    const filtered0 = filterSubjectGraphsForceGraphDataByMaxHop(data, effective, 0);
    const filtered1 = filterSubjectGraphsForceGraphDataByMaxHop(data, effective, 1);
    expect(filtered0.nodes.map((n) => n.topicId).sort()).toEqual(['advanced']);
    expect(filtered1.nodes.map((n) => n.topicId).sort()).toEqual(['advanced', 'intro']);
  });
});

describe('getMaxBfsDepthFromSeeds and getSelectableMaxHop', () => {
  it('returns 0 for empty distances', () => {
    expect(getMaxBfsDepthFromSeeds(new Map())).toBe(0);
    expect(getSelectableMaxHop(new Map())).toBe(2);
  });

  it('getSelectableMaxHop is at least 2 even when max depth is 1', () => {
    const m = new Map([
      ['a', 0],
      ['b', 1],
    ]);
    expect(getMaxBfsDepthFromSeeds(m)).toBe(1);
    expect(getSelectableMaxHop(m)).toBe(2);
  });
});

describe('clusterCentersOnCircle', () => {
  it('returns one center at box midpoint for a single cluster', () => {
    const [c] = clusterCentersOnCircle(1, 400, 300, 0);
    expect(c).toEqual({ x: 200, y: 150 });
  });

  it('places three clusters on a circle', () => {
    const centers = clusterCentersOnCircle(3, 300, 300, 50);
    expect(centers).toHaveLength(3);
    const cx = 150;
    const cy = 150;
    const r = 100;
    expect(centers[0]!.x).toBeCloseTo(cx, 5);
    expect(centers[0]!.y).toBeCloseTo(cy - r, 5);
  });
});
