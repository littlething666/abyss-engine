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
    const raw = `{"cards":[{"id":"t-mc-1","type":"MULTI_CHOICE","difficulty":1,"content":{"question":"Q?","options":["a","b"],"answer":["a"],"explanation":""}}]}`;
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
            pairs: [{ item1: 'Dot Product', item2: 'Results in a scalar value' }],
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
    expect(sb.items.map((i) => i.label)).toEqual(['Pair elements', 'Multiply pairs']);
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
            categories: ['Central Tendency', 'Dispersion'],
            items: [
              { item: 'Mean', category: 'Central Tendency' },
              { item: 'Range', category: 'Dispersion' },
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
            pairs: [{ term: 'Mean', definition: 'The average' }],
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
            items: [{ text: 'Step one', correctPosition: 0 }],
            explanation: 'ex',
          },
        },
      ],
    });
    const r = parseTopicCardsPayload(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const c0 = r.cards[0].content as { items: { label: string }[] };
    expect(c0.items.map((x) => x.label)).toEqual(['Mean', 'Range']);

    const c1 = r.cards[1].content as { pairs: { left: string; right: string }[] };
    expect(c1.pairs[0]).toMatchObject({ left: 'Mean', right: 'The average' });

    const c2 = r.cards[2].content as { items: { label: string }[] };
    expect(c2.items[0].label).toBe('Step one');
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
