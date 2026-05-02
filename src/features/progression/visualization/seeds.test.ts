import { describe, expect, it } from 'vitest';

import { subjectSeedFromId, topicSeedFromRef } from './seeds';

describe('subjectSeedFromId', () => {
  it('is deterministic for the same input', () => {
    expect(subjectSeedFromId('sub-a')).toBe(subjectSeedFromId('sub-a'));
  });

  it('falls back to 0.5 when the subject id is missing', () => {
    expect(subjectSeedFromId(null)).toBe(0.5);
    expect(subjectSeedFromId(undefined)).toBe(0.5);
    expect(subjectSeedFromId('')).toBe(0.5);
  });

  it('returns values in [0, 1)', () => {
    for (let i = 0; i < 64; i++) {
      const v = subjectSeedFromId(`sub-${i}`);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces different seeds for distinct ids', () => {
    expect(subjectSeedFromId('sub-a')).not.toBe(subjectSeedFromId('sub-b'));
  });
});

describe('topicSeedFromRef', () => {
  it('is deterministic for the same ref', () => {
    const a = topicSeedFromRef({ subjectId: 's', topicId: 't' });
    const b = topicSeedFromRef({ subjectId: 's', topicId: 't' });
    expect(a).toBe(b);
  });

  it('returns values in [0, 1) across a generated corpus', () => {
    for (let i = 0; i < 200; i++) {
      const v = topicSeedFromRef({ subjectId: 'sub', topicId: `topic-${i}` });
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces different seeds for different topics under the same subject', () => {
    const a = topicSeedFromRef({ subjectId: 's', topicId: 'alpha' });
    const b = topicSeedFromRef({ subjectId: 's', topicId: 'beta' });
    expect(a).not.toBe(b);
  });

  it('differs across subject boundaries when topicId is identical', () => {
    const a = topicSeedFromRef({ subjectId: 's1', topicId: 'shared' });
    const b = topicSeedFromRef({ subjectId: 's2', topicId: 'shared' });
    expect(a).not.toBe(b);
  });
});
