import { describe, expect, it } from 'vitest';

import type { Card } from '@/types/core';

import { mergeTopicCards } from './deckContentWriter';

describe('mergeTopicCards', () => {
  it('replaces cards with matching ids and appends new ids', () => {
    const prior: Card[] = [
      {
        id: 'a',
        type: 'FLASHCARD',
        difficulty: 1,
        content: { front: 'old', back: 'old' },
      },
      {
        id: 'b',
        type: 'FLASHCARD',
        difficulty: 1,
        content: { front: 'b', back: 'b' },
      },
    ];
    const incoming: Card[] = [
      {
        id: 'a',
        type: 'FLASHCARD',
        difficulty: 1,
        content: { front: 'new', back: 'new' },
      },
      {
        id: 'c',
        type: 'FLASHCARD',
        difficulty: 2,
        content: { front: 'c', back: 'c' },
      },
    ];
    const merged = mergeTopicCards(prior, incoming);
    expect(merged).toHaveLength(3);
    expect((merged[0].content as { front: string }).front).toBe('new');
    expect(merged[1].id).toBe('b');
    expect(merged[2].id).toBe('c');
  });
});
