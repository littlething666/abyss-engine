import { describe, expect, it, afterEach } from 'vitest';
import { getClusterGeometry, disposeClusterGeometries, SHARD_ACTIVATION_LEVELS } from './crystalClusterGeometry';
import type { CrystalBaseShape } from '../../types/core';

afterEach(() => {
  disposeClusterGeometries();
});

const SHAPES: CrystalBaseShape[] = ['icosahedron', 'octahedron', 'tetrahedron', 'dodecahedron'];

describe('crystalClusterGeometry', () => {
  it.each(SHAPES)('builds a merged cluster geometry for "%s"', (shape) => {
    const geo = getClusterGeometry(shape);
    expect(geo).toBeDefined();
    expect(geo.attributes.position).toBeDefined();
    expect(geo.attributes.normal).toBeDefined();
    expect(geo.attributes.uv).toBeDefined();
  });

  it('encodes shard index in UV.x for every vertex (0–5)', () => {
    const geo = getClusterGeometry('icosahedron');
    const uvAttr = geo.attributes.uv;
    const arr = uvAttr.array as Float32Array;
    for (let i = 0; i < uvAttr.count; i++) {
      const shardVal = arr[i * 2];
      expect(shardVal).toBeGreaterThanOrEqual(0);
      expect(shardVal).toBeLessThanOrEqual(5);
      expect(Number.isInteger(shardVal)).toBe(true);
    }
  });

  it('produces different geometries per shape', () => {
    const ico = getClusterGeometry('icosahedron');
    const tet = getClusterGeometry('tetrahedron');
    expect(ico.attributes.position.count).not.toBe(tet.attributes.position.count);
  });

  it('returns cached geometry on second call', () => {
    const first = getClusterGeometry('octahedron');
    const second = getClusterGeometry('octahedron');
    expect(first).toBe(second);
  });

  it('defines per-level shard activation: 1→6 shards across L0–L5', () => {
    expect(SHARD_ACTIVATION_LEVELS).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
