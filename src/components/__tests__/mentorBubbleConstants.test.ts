import { describe, expect, it } from 'vitest';

import {
  HIT_TARGET_RADIUS_LOCAL,
  RING_INNER_LOCAL,
  RING_OUTER_LOCAL,
  GLYPH_RADIUS_LOCAL,
} from '../mentorBubbleConstants';

describe('mentorBubbleConstants', () => {
  it('keeps the hit target strictly larger than the ring (mobile tap reliability)', () => {
    expect(HIT_TARGET_RADIUS_LOCAL).toBeGreaterThan(RING_OUTER_LOCAL);
  });

  it('derives the hit target from the ring outer radius (decoupled from glyph size)', () => {
    // RING_OUTER_LOCAL * 1.5 = 0.45 at the current ring outer radius;
    // diameter 0.90. This invariant must NOT be coupled to glyph size, so
    // future glyph tweaks never regress mobile tap reliability.
    expect(HIT_TARGET_RADIUS_LOCAL).toBeCloseTo(RING_OUTER_LOCAL * 1.5, 6);
    // The same ratio must NOT match the glyph plane radius — if those
    // happened to match, a glyph tweak could regress the hit target.
    expect(HIT_TARGET_RADIUS_LOCAL).not.toBeCloseTo(GLYPH_RADIUS_LOCAL, 6);
  });

  it('keeps the visible mentor bubble ring as a thin outline instead of a disk-like backing plate', () => {
    const ringThickness = RING_OUTER_LOCAL - RING_INNER_LOCAL;

    expect(ringThickness).toBeCloseTo(0.015, 6);
    // 0.015/0.30 === 0.05 but IEEE division can land epsilon above 0.05.
    expect(ringThickness / RING_OUTER_LOCAL).toBeCloseTo(0.05, 5);
    expect(RING_INNER_LOCAL).toBeGreaterThan(GLYPH_RADIUS_LOCAL);
  });
});
