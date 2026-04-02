import { describe, expect, it, afterEach } from 'vitest';
import {
  disposeAltarGeometries,
  getAltarFragmentSpecs,
  getFracturedBaseGeometry,
  getNexusCrystalGeometry,
} from './altarGeometry';

afterEach(() => {
  disposeAltarGeometries();
});

describe('altarGeometry', () => {
  it('builds nexus crystal with positions and normals', () => {
    const geo = getNexusCrystalGeometry();
    expect(geo.attributes.position).toBeDefined();
    expect(geo.attributes.normal).toBeDefined();
    expect(geo.attributes.position.count).toBeGreaterThan(0);
  });

  it('caches nexus geometry', () => {
    expect(getNexusCrystalGeometry()).toBe(getNexusCrystalGeometry());
  });

  it('provides six fragment specs with geometry each', () => {
    const specs = getAltarFragmentSpecs();
    expect(specs).toHaveLength(6);
    for (const spec of specs) {
      expect(spec.geometry.attributes.position).toBeDefined();
      expect(spec.scale).toBeGreaterThan(0);
    }
  });

  it('caches fractured base geometry', () => {
    expect(getFracturedBaseGeometry()).toBe(getFracturedBaseGeometry());
  });
});
