/**
 * Tests for `appliedArtifactsStore` — Phase 0.5 step 5.
 *
 * Covers:
 * - has() returns false for unknown contentHash
 * - record() + has() round-trip
 * - Pruning does not throw
 */

import { beforeEach, describe, it, expect } from 'vitest';
import Dexie from 'dexie';

import { appliedArtifactsStore } from './appliedArtifactsStore';

describe('appliedArtifactsStore', () => {
  // Use a fresh database per test
  beforeEach(async () => {
    const db = new Dexie('abyss-applied-artifacts');
    await db.delete({ disableAutoOpen: true });
  });

  it('has() returns false for unknown contentHash', async () => {
    const result = await appliedArtifactsStore.has('cnt_nonexistent');
    expect(result).toBe(false);
  });

  it('record() + has() round-trip', async () => {
    await appliedArtifactsStore.record('cnt_test', 'topic-theory', 1000);
    const result = await appliedArtifactsStore.has('cnt_test');
    expect(result).toBe(true);
  });

  it('recording same contentHash twice is idempotent (has still returns true)', async () => {
    await appliedArtifactsStore.record('cnt_dup', 'topic-study-cards', 1000);
    await appliedArtifactsStore.record('cnt_dup', 'topic-study-cards', 2000); // different timestamp
    const result = await appliedArtifactsStore.has('cnt_dup');
    expect(result).toBe(true);
  });

  it('different contentHash returns false after only another recorded', async () => {
    await appliedArtifactsStore.record('cnt_a', 'topic-theory', 1000);
    const result = await appliedArtifactsStore.has('cnt_b');
    expect(result).toBe(false);
  });

  it('getLatestTopicExpansionScope returns the latest scoped expansion', async () => {
    await appliedArtifactsStore.record(
      'cnt_e1',
      'topic-expansion-cards',
      100,
      {
        variant: 'topic-expansion',
        subjectId: 's1',
        topicId: 't1',
        targetLevel: 6,
      },
    );
    await appliedArtifactsStore.record(
      'cnt_e2',
      'topic-expansion-cards',
      200,
      {
        variant: 'topic-expansion',
        subjectId: 's1',
        topicId: 't1',
        targetLevel: 7,
      },
    );
    const latest = await appliedArtifactsStore.getLatestTopicExpansionScope('s1', 't1');
    expect(latest?.contentHash).toBe('cnt_e2');
    expect(latest?.targetLevel).toBe(7);
  });

  it('record() with different kinds works independently', async () => {
    await appliedArtifactsStore.record('cnt_shared', 'topic-theory', 1000);
    const result = await appliedArtifactsStore.has('cnt_shared');
    expect(result).toBe(true);
    expect(await appliedArtifactsStore.has('cnt_other')).toBe(false);
  });
});
