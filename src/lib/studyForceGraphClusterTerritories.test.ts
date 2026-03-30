import { describe, expect, it } from 'vitest';

import {
  computeClusterTerritoryCircles,
  DEFAULT_CLUSTER_TERRITORY_PAD_PX,
} from './studyForceGraphClusterTerritories';

const NODE_R = 14;
const PAD = DEFAULT_CLUSTER_TERRITORY_PAD_PX;

describe('computeClusterTerritoryCircles', () => {
  it('single node: centroid at node, radius nodeRadius + pad', () => {
    const res = computeClusterTerritoryCircles(['sub-a'], [{ clusterIndex: 0, x: 10, y: 20 }], NODE_R, PAD);
    expect(res).toEqual([
      { clusterIndex: 0, subjectId: 'sub-a', cx: 10, cy: 20, r: NODE_R + PAD },
    ]);
  });

  it('two collinear nodes: centroid midway, radius covers both', () => {
    const res = computeClusterTerritoryCircles(
      ['sub-a'],
      [
        { clusterIndex: 0, x: 0, y: 0 },
        { clusterIndex: 0, x: 10, y: 0 },
      ],
      NODE_R,
      PAD,
    );
    expect(res).toHaveLength(1);
    expect(res[0]!.cx).toBeCloseTo(5);
    expect(res[0]!.cy).toBeCloseTo(0);
    expect(res[0]!.r).toBeCloseTo(5 + NODE_R + PAD);
  });

  it('three nodes: centroid is mean; radius from farthest center', () => {
    const res = computeClusterTerritoryCircles(
      ['sub-a'],
      [
        { clusterIndex: 0, x: 0, y: 0 },
        { clusterIndex: 0, x: 6, y: 0 },
        { clusterIndex: 0, x: 3, y: 4 },
      ],
      NODE_R,
      PAD,
    );
    expect(res).toHaveLength(1);
    expect(res[0]!.cx).toBeCloseTo(3);
    expect(res[0]!.cy).toBeCloseTo(4 / 3);
    const { cx, cy } = res[0]!;
    const dists = [
      Math.hypot(0 - cx, 0 - cy),
      Math.hypot(6 - cx, 0 - cy),
      Math.hypot(3 - cx, 4 / 3 - cy),
    ];
    const maxD = Math.max(...dists);
    expect(res[0]!.r).toBeCloseTo(maxD + NODE_R + PAD);
  });

  it('skips empty cluster indices', () => {
    const res = computeClusterTerritoryCircles(
      ['a', 'b'],
      [{ clusterIndex: 1, x: 1, y: 1 }],
      NODE_R,
      PAD,
    );
    expect(res).toHaveLength(1);
    expect(res[0]!.subjectId).toBe('b');
    expect(res[0]!.clusterIndex).toBe(1);
  });

  it('returns separate circles for two clusters', () => {
    const res = computeClusterTerritoryCircles(
      ['left', 'right'],
      [
        { clusterIndex: 0, x: 0, y: 0 },
        { clusterIndex: 1, x: 100, y: 0 },
      ],
      NODE_R,
      PAD,
    );
    expect(res).toHaveLength(2);
    expect(res[0]!.subjectId).toBe('left');
    expect(res[1]!.subjectId).toBe('right');
    expect(res[1]!.cx).toBe(100);
  });
});
