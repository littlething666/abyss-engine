import { describe, expect, it } from 'vitest';

import { interpolatePromptTemplate } from '@/lib/interpolatePromptTemplate';

import { parseTopicCardsPayload } from './parseTopicCardsPayload';

describe('parseTopicCardsPayload', () => {
  it('accepts FLASHCARD with question/answer aliases mapped to front/back', () => {
    const raw = `\`\`\`json
{"cards":[{"id":"t-flash-1","type":"FLASHCARD","difficulty":1,"content":{"question":"Q?","answer":"A."}}]}
\`\`\``;
    const r = parseTopicCardsPayload(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cards[0].type).toBe('FLASHCARD');
      expect(r.cards[0].content).toMatchObject({ front: 'Q?', back: 'A.' });
    }
  });

  it('accepts SINGLE_CHOICE with answer alias mapped to correctAnswer', () => {
    const raw = `{"cards":[{"id":"t-sc-1","type":"SINGLE_CHOICE","difficulty":1,"content":{"question":"Q?","options":["a","b","c","d"],"answer":"b","explanation":""}}]}`;
    const r = parseTopicCardsPayload(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cards[0].content).toMatchObject({ correctAnswer: 'b' });
    }
  });

  it('accepts MULTI_CHOICE with answer array alias mapped to correctAnswers', () => {
    const raw = `{"cards":[{"id":"t-mc-1","type":"MULTI_CHOICE","difficulty":1,"content":{"question":"Q?","options":["a","b","c"],"answer":["a"],"explanation":""}}]}`;
    const r = parseTopicCardsPayload(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cards[0].content).toMatchObject({ correctAnswers: ['a'] });
    }
  });

  it('normalizes LLM-alias MINI_GAME shapes (string categories, content/category, item1/item2, string distractors)', () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: 'linear-algebra-fundamentals-mg-structure-sort',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'CATEGORY_SORT',
            prompt: 'Categorize the terms.',
            categories: ['Scalar', 'Vector', 'Matrix'],
            items: [
              { content: 'A single real number', category: 'Scalar' },
              { content: 'An ordered list of numbers', category: 'Vector' },
              { content: 'A rectangular number array', category: 'Matrix' },
              { content: 'Magnitude only', category: 'Scalar' },
              { content: 'Direction and magnitude', category: 'Vector' },
              { content: 'Linear transformation table', category: 'Matrix' },
            ],
            explanation: 'Scalars are single values.',
          },
        },
        {
          id: 'linear-algebra-fundamentals-mg-op-connections',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'CONNECTION_WEB',
            prompt: 'Match concepts.',
            pairs: [
              { item1: 'Dot Product', item2: 'Results in a scalar value' },
              { item1: 'Matrix product', item2: 'Composes linear maps' },
              { item1: 'Vector norm', item2: 'Measures length' },
            ],
            distractors: ['Always results in a matrix'],
            explanation: 'Dot product yields a scalar.',
          },
        },
        {
          id: 'linear-algebra-fundamentals-mg-dot-product-seq',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'SEQUENCE_BUILD',
            prompt: 'Order the steps.',
            items: [
              { content: 'Pair elements', correctPosition: 0 },
              { content: 'Multiply pairs', correctPosition: 1 },
              { content: 'Sum products', correctPosition: 2 },
            ],
            explanation: 'Pair, multiply, sum.',
          },
        },
      ],
    });
    const r = parseTopicCardsPayload(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cards).toHaveLength(3);

    const cs = r.cards[0].content as { gameType: string; categories: { id: string; label: string }[] };
    expect(cs.gameType).toBe('CATEGORY_SORT');
    expect(cs.categories.map((c) => c.label)).toEqual(['Scalar', 'Vector', 'Matrix']);
    expect(cs.categories.every((c) => typeof c.id === 'string' && c.id.length > 0)).toBe(true);

    const cw = r.cards[1].content as {
      gameType: string;
      pairs: { id: string; left: string; right: string }[];
      distractors: { id: string; side: string; label: string }[];
    };
    expect(cw.gameType).toBe('CONNECTION_WEB');
    expect(cw.pairs[0]).toMatchObject({
      left: 'Dot Product',
      right: 'Results in a scalar value',
    });
    expect(cw.pairs[0].id.length).toBeGreaterThan(0);
    expect(cw.distractors[0]).toMatchObject({ side: 'right', label: 'Always results in a matrix' });

    const sb = r.cards[2].content as { gameType: string; items: { id: string; label: string; correctPosition: number }[] };
    expect(sb.gameType).toBe('SEQUENCE_BUILD');
    expect(sb.items.map((i) => i.label)).toEqual(['Pair elements', 'Multiply pairs', 'Sum products']);
    expect(sb.items.every((i) => typeof i.id === 'string' && i.id.length > 0)).toBe(true);
  });

  it('normalizes item/text/term-definition aliases (descriptive-statistics style LLM output)', () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: 'descriptive-statistics-mg-sort-measures',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'CATEGORY_SORT',
            prompt: 'Sort measures.',
            categories: ['Central Tendency', 'Dispersion', 'Shape'],
            items: [
              { item: 'Mean', category: 'Central Tendency' },
              { item: 'Range', category: 'Dispersion' },
              { item: 'Median', category: 'Central Tendency' },
              { item: 'Standard deviation', category: 'Dispersion' },
              { item: 'Skewness', category: 'Shape' },
              { item: 'Mode', category: 'Central Tendency' },
            ],
            explanation: 'ex',
          },
        },
        {
          id: 'descriptive-statistics-mg-def-match',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'CONNECTION_WEB',
            prompt: 'Match.',
            pairs: [
              { term: 'Mean', definition: 'The average' },
              { term: 'Median', definition: 'The middle ordered value' },
              { term: 'Range', definition: 'Maximum minus minimum' },
            ],
            distractors: ['d1'],
            explanation: 'ex',
          },
        },
        {
          id: 'descriptive-statistics-mg-sd-steps',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'SEQUENCE_BUILD',
            prompt: 'Order.',
            items: [
              { text: 'Step one', correctPosition: 0 },
              { text: 'Step two', correctPosition: 1 },
              { text: 'Step three', correctPosition: 2 },
            ],
            explanation: 'ex',
          },
        },
      ],
    });
    const r = parseTopicCardsPayload(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const c0 = r.cards[0].content as { items: { label: string }[] };
    expect(c0.items.map((x) => x.label)).toEqual([
      'Mean',
      'Range',
      'Median',
      'Standard deviation',
      'Skewness',
      'Mode',
    ]);

    const c1 = r.cards[1].content as { pairs: { left: string; right: string }[] };
    expect(c1.pairs[0]).toMatchObject({ left: 'Mean', right: 'The average' });

    const c2 = r.cards[2].content as { items: { label: string }[] };
    expect(c2.items[0].label).toBe('Step one');
  });

  it('rejects CATEGORY_SORT when a declared category has no items (unused_category)', () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: 't-mg-cat-unused',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'CATEGORY_SORT',
            prompt: 'Sort into buckets.',
            explanation: 'Unused category reproduces upstream structural failure.',
            categories: [
              { id: 'cat-a', label: 'A' },
              { id: 'cat-b', label: 'B' },
              { id: 'cat-no-equilibrium', label: 'No equilibrium' },
            ],
            items: [
              { id: 'i0', label: 'a0', categoryId: 'cat-a' },
              { id: 'i1', label: 'a1', categoryId: 'cat-a' },
              { id: 'i2', label: 'b0', categoryId: 'cat-b' },
              { id: 'i3', label: 'b1', categoryId: 'cat-b' },
              { id: 'i4', label: 'b2', categoryId: 'cat-b' },
              { id: 'i5', label: 'a2', categoryId: 'cat-a' },
            ],
          },
        },
      ],
    });
    const r = parseTopicCardsPayload(raw, {
      allowedCardTypes: ['MINI_GAME'],
      allowedMiniGameTypes: ['CATEGORY_SORT'],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const unused = r.qualityReport?.failures.filter((f) => f.code === 'unused_category') ?? [];
    expect(unused.length).toBeGreaterThan(0);
    expect(unused.some((f) => f.message.includes('cat-no-equilibrium'))).toBe(true);
  });

  it('accepts CATEGORY_SORT with 3 categories, 6 items, and every category referenced', () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: 't-mg-cat-valid',
          type: 'MINI_GAME',
          difficulty: 1,
          content: {
            gameType: 'CATEGORY_SORT',
            prompt: 'Sort.',
            explanation: 'ex',
            categories: [
              { id: 'c0', label: 'C0' },
              { id: 'c1', label: 'C1' },
              { id: 'c2', label: 'C2' },
            ],
            items: [
              { id: 'i0', label: 'l0', categoryId: 'c0' },
              { id: 'i1', label: 'l1', categoryId: 'c0' },
              { id: 'i2', label: 'l2', categoryId: 'c1' },
              { id: 'i3', label: 'l3', categoryId: 'c1' },
              { id: 'i4', label: 'l4', categoryId: 'c2' },
              { id: 'i5', label: 'l5', categoryId: 'c2' },
            ],
          },
        },
      ],
    });
    const r = parseTopicCardsPayload(raw, {
      allowedCardTypes: ['MINI_GAME'],
      allowedMiniGameTypes: ['CATEGORY_SORT'],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cards).toHaveLength(1);
  });

  it('topic-mini-game prompt template keeps JSON example braces after interpolation', () => {
    const topicMiniGameCardsTemplate = `Output \`{ "cards": [ ... ] }\`.
Topic id: {{topicId}}
`;
    const out = interpolatePromptTemplate(topicMiniGameCardsTemplate, { topicId: 't1' });
    expect(out).toContain('{ "cards": [ ... ] }');
    expect(out).toContain('Topic id: t1');
  });
});
