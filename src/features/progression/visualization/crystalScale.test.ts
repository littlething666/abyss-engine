import { describe, expect, it } from 'vitest';

import { getCrystalScale } from './crystalScale';

describe('crystal scale mapping', () => {
  it('keeps base scale for level zero crystals', () => {
    expect(getCrystalScale(0)).toBeCloseTo(0.6);
  });

  it('adds growth in fixed 0.15 steps per level', () => {
    expect(getCrystalScale(1)).toBeCloseTo(0.75);
    expect(getCrystalScale(2)).toBeCloseTo(0.9);
  });
});
