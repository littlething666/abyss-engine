import { describe, expect, it } from 'vitest';

import {
  HIT_TARGET_RADIUS_LOCAL,
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
});
