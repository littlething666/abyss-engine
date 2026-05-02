import { describe, expect, it } from 'vitest';

import { GENERATED_MENTOR_ICON_NODES } from '@/graphics/labels/generated/mentorIconNodes';
import { MENTOR_ICON_NAMES } from '../mentorIconAllowlist';

const SUPPORTED_TAGS = new Set([
  'path',
  'line',
  'circle',
  'rect',
  'polyline',
  'polygon',
  'ellipse',
]);

describe('GENERATED_MENTOR_ICON_NODES', () => {
  it('covers every entry in MENTOR_ICON_NAMES with at least one primitive', () => {
    for (const name of MENTOR_ICON_NAMES) {
      const nodes = GENERATED_MENTOR_ICON_NODES[name];
      expect(nodes, `expected primitives for "${name}"`).toBeTruthy();
      expect(nodes.length, `expected at least one primitive for "${name}"`).toBeGreaterThan(0);
    }
  });

  it('uses only supported SVG primitive tags across all icons', () => {
    for (const name of MENTOR_ICON_NAMES) {
      const nodes = GENERATED_MENTOR_ICON_NODES[name];
      for (const [tag] of nodes) {
        expect(SUPPORTED_TAGS.has(tag)).toBe(true);
      }
    }
  });

  it('emits the four hand-authored philosopher-stone primitives in order', () => {
    const nodes = GENERATED_MENTOR_ICON_NODES['philosopher-stone'];
    expect(nodes).toHaveLength(4);
    expect(nodes[0]?.[0]).toBe('circle');
    expect(nodes[1]?.[0]).toBe('polygon');
    expect(nodes[2]?.[0]).toBe('rect');
    expect(nodes[3]?.[0]).toBe('circle');
  });

  it('philosopher-stone outer circle uses radius 11 (corrected proportions)', () => {
    const nodes = GENERATED_MENTOR_ICON_NODES['philosopher-stone'];
    const [outerTag, outerAttrs] = nodes[0]!;
    expect(outerTag).toBe('circle');
    if (outerTag === 'circle') {
      expect(String(outerAttrs.r)).toBe('11');
    }
  });

  it('philosopher-stone inner square has the OQ1-corrected side length 8.7', () => {
    const nodes = GENERATED_MENTOR_ICON_NODES['philosopher-stone'];
    const [rectTag, rectAttrs] = nodes[2]!;
    expect(rectTag).toBe('rect');
    if (rectTag === 'rect') {
      expect(String(rectAttrs.width)).toBe('8.7');
      expect(String(rectAttrs.height)).toBe('8.7');
    }
  });
});
