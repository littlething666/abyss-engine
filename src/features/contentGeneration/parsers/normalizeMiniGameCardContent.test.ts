import { describe, expect, it } from 'vitest';

import { normalizeMiniGameCardContent } from './normalizeMiniGameCardContent';

describe('normalizeMiniGameCardContent', () => {
  it('is deterministic for the same card id and payload', () => {
    const cardId = 'topic-mg-1';
    const content = {
      gameType: 'CATEGORY_SORT' as const,
      prompt: 'Sort.',
      categories: ['A', 'B'],
      items: [{ content: 'x', category: 'A' }],
      explanation: 'e',
    };
    const a = normalizeMiniGameCardContent(cardId, content);
    const b = normalizeMiniGameCardContent(cardId, content);
    expect(a).toEqual(b);
  });

  it('rejects category sort items when category name does not resolve', () => {
    const out = normalizeMiniGameCardContent('c1', {
      gameType: 'CATEGORY_SORT',
      prompt: 'p',
      categories: ['Only'],
      items: [{ content: 'item', category: 'Missing' }],
      explanation: 'e',
    });
    expect((out as { items: unknown[] }).items).toEqual([]);
  });

  it('maps item alias to label for CATEGORY_SORT', () => {
    const out = normalizeMiniGameCardContent('card-x', {
      gameType: 'CATEGORY_SORT',
      prompt: 'p',
      categories: ['A'],
      items: [{ item: 'Mean', category: 'A' }],
      explanation: 'e',
    }) as { items: { id: string; label: string; categoryId: string }[] };
    expect(out.items[0].label).toBe('Mean');
  });
});
