import { describe, it, expect } from 'vitest';
import { ensureGlobalCardIdPrefix } from './cardIdUtils';
import type { Card } from '@/types/core';

const makeCard = (id: string): Card => ({
  id,
  type: 'FLASHCARD',
  difficulty: 1,
  content: { front: 'Q', back: 'A' },
});

describe('ensureGlobalCardIdPrefix', () => {
  it('prefixes card IDs with subjectId/topicId/', () => {
    const cards = [makeCard('fc-1'), makeCard('fc-2')];
    const result = ensureGlobalCardIdPrefix(cards, 'math', 'algebra');
    expect(result[0].id).toBe('math/algebra/fc-1');
    expect(result[1].id).toBe('math/algebra/fc-2');
  });

  it('does not double-prefix already-prefixed IDs', () => {
    const cards = [makeCard('math/algebra/fc-1')];
    const result = ensureGlobalCardIdPrefix(cards, 'math', 'algebra');
    expect(result[0].id).toBe('math/algebra/fc-1');
  });

  it('distinguishes same local ID across different subjects', () => {
    const cards = [makeCard('fc-1')];
    const a = ensureGlobalCardIdPrefix(cards, 'subject-a', 'topic-x');
    const b = ensureGlobalCardIdPrefix(cards, 'subject-b', 'topic-x');
    expect(a[0].id).not.toBe(b[0].id);
  });

  it('preserves all other card properties', () => {
    const cards = [makeCard('fc-1')];
    const result = ensureGlobalCardIdPrefix(cards, 's', 't');
    expect(result[0].type).toBe('FLASHCARD');
    expect(result[0].difficulty).toBe(1);
    expect(result[0].content).toEqual({ front: 'Q', back: 'A' });
  });
});
