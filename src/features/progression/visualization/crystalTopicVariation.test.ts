import { describe, expect, it } from 'vitest';

import { CRYSTAL_BASE_SHAPES, type TopicRef } from '@/types/core';

import { crystalBaseShapeFromTopicRef } from './crystalBaseShape';
import { topicSeedFromRef } from './seeds';

const CORPUS_SIZE = 200;

function generatedCorpus(): TopicRef[] {
  const refs: TopicRef[] = [];
  for (let i = 0; i < CORPUS_SIZE; i++) {
    refs.push({ subjectId: 'subject', topicId: `topic-${i}` });
  }
  return refs;
}

describe('crystalTopicVariation', () => {
  it('topicSeedFromRef is deterministic and returns values in [0, 1)', () => {
    const corpus = generatedCorpus();
    for (const ref of corpus) {
      const a = topicSeedFromRef(ref);
      const b = topicSeedFromRef(ref);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  it('produces different seeds for same-subject / different-topic refs (drives noise, jitter, emissive drift)', () => {
    const corpus = generatedCorpus();
    const seenSeeds = new Set<number>();
    let collisions = 0;
    for (const ref of corpus) {
      const seed = topicSeedFromRef(ref);
      if (seenSeeds.has(seed)) {
        collisions += 1;
      }
      seenSeeds.add(seed);
    }
    // FNV-1a over a 200-element corpus should not collide; allow 0 collisions
    // and assert distinct-seed coverage.
    expect(collisions).toBe(0);
    expect(seenSeeds.size).toBe(corpus.length);
  });

  it('crystalBaseShapeFromTopicRef is deterministic', () => {
    const corpus = generatedCorpus();
    for (const ref of corpus) {
      expect(crystalBaseShapeFromTopicRef(ref)).toBe(crystalBaseShapeFromTopicRef(ref));
    }
  });

  it('uses every shape bucket and stays within ±25% of even distribution over the corpus', () => {
    const counts: Record<string, number> = {};
    for (const shape of CRYSTAL_BASE_SHAPES) {
      counts[shape] = 0;
    }
    for (const ref of generatedCorpus()) {
      const shape = crystalBaseShapeFromTopicRef(ref);
      counts[shape] += 1;
    }

    const expectedPerBucket = CORPUS_SIZE / CRYSTAL_BASE_SHAPES.length; // 50
    const lower = expectedPerBucket * 0.75; // 37.5 — corresponds to 18.75% share
    const upper = expectedPerBucket * 1.25; // 62.5 — corresponds to 31.25% share

    for (const shape of CRYSTAL_BASE_SHAPES) {
      expect(counts[shape]).toBeGreaterThan(0);
      expect(counts[shape]).toBeGreaterThanOrEqual(lower);
      expect(counts[shape]).toBeLessThanOrEqual(upper);
    }
  });

  it('does not require same-subject topics to receive distinct shapes (only distinct seeds)', () => {
    // With 4 buckets, two arbitrary topics share a bucket ~25% of the time;
    // shape collisions are expected and should not be asserted away. Seeds,
    // however, are required to differ — confirmed by the seed-collision test
    // above. This test simply documents the contract.
    const a = { subjectId: 's', topicId: 'alpha' };
    const b = { subjectId: 's', topicId: 'beta' };
    expect(topicSeedFromRef(a)).not.toBe(topicSeedFromRef(b));
    // No assertion that crystalBaseShapeFromTopicRef(a) !== crystalBaseShapeFromTopicRef(b).
  });
});
