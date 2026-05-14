/**
 * Golden eval fixtures for the `topic-mini-game-category-sort` artifact.
 *
 * Semantic failures collapse to `validation:semantic-mini-game-playability`
 * for: duplicate category id, duplicate item id, item references unknown
 * category, declared category with zero items.
 */

import { acc, fx, mut, pfJson, pfShape, ser, sf } from './_helpers';
import type { EvalFixture } from './types';

type CSCard = {
  id: string;
  topicId: string;
  type: string;
  difficulty: number;
  content: Record<string, unknown>;
};

const validCard = (id = 'cs-1'): CSCard => ({
  id,
  topicId: 'topic-cs',
  type: 'MINI_GAME',
  difficulty: 2,
  content: {
    gameType: 'CATEGORY_SORT',
    categories: [
      { id: 'cat-mammal', label: 'Mammal' },
      { id: 'cat-bird', label: 'Bird' },
    ],
    items: [
      { id: 'i-cat', label: 'Cat', categoryId: 'cat-mammal' },
      { id: 'i-dog', label: 'Dog', categoryId: 'cat-mammal' },
      { id: 'i-eagle', label: 'Eagle', categoryId: 'cat-bird' },
    ],
  },
});

const validBase = { cards: [validCard()] };

export const topicMiniGameCategorySortFixtures: ReadonlyArray<EvalFixture> = [
  // ----- accept (8) -----
  fx({ name: 'accept-single-card', raw: ser(validBase), expected: acc() }),
  fx({ name: 'accept-multi-card', raw: ser({ cards: [validCard('cs-1'), validCard('cs-2')] }), expected: acc() }),
  fx({ name: 'accept-three-categories', raw: ser({ cards: [{
    ...validCard(),
    content: {
      gameType: 'CATEGORY_SORT',
      categories: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
      items: [
        { id: 'i1', label: 'I1', categoryId: 'a' },
        { id: 'i2', label: 'I2', categoryId: 'b' },
        { id: 'i3', label: 'I3', categoryId: 'c' },
      ],
    },
  }] }), expected: acc() }),
  fx({ name: 'accept-difficulty-1', raw: mut(validBase, (d) => { d.cards[0].difficulty = 1; }), expected: acc() }),
  fx({ name: 'accept-difficulty-4', raw: mut(validBase, (d) => { d.cards[0].difficulty = 4; }), expected: acc() }),
  fx({ name: 'accept-many-items', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).items = [
    { id: 'i-a', label: 'A', categoryId: 'cat-mammal' },
    { id: 'i-b', label: 'B', categoryId: 'cat-mammal' },
    { id: 'i-c', label: 'C', categoryId: 'cat-bird' },
    { id: 'i-d', label: 'D', categoryId: 'cat-bird' },
    { id: 'i-e', label: 'E', categoryId: 'cat-bird' },
  ]; }), expected: acc() }),
  fx({ name: 'accept-min-categories-min-items', raw: ser({ cards: [{
    ...validCard(),
    content: {
      gameType: 'CATEGORY_SORT',
      categories: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      items: [
        { id: 'i1', label: 'I1', categoryId: 'a' },
        { id: 'i2', label: 'I2', categoryId: 'b' },
      ],
    },
  }] }), expected: acc() }),
  fx({ name: 'accept-distinct-labels', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).categories = [{ id: 'x1', label: 'A' }, { id: 'x2', label: 'B' }]; (d.cards[0].content as Record<string, unknown>).items = [{ id: 'p1', label: 'P1', categoryId: 'x1' }, { id: 'p2', label: 'P2', categoryId: 'x2' }]; }), expected: acc() }),

  // ----- parse:json-mode-violation (5) -----
  fx({ name: 'json-markdown-fence', raw: '```\n' + ser(validBase) + '\n```', expected: pfJson() }),
  fx({ name: 'json-leading-prose', raw: 'Result: ' + ser(validBase), expected: pfJson() }),
  fx({ name: 'json-trailing-prose', raw: ser(validBase) + ' end', expected: pfJson() }),
  fx({ name: 'json-truncated', raw: '{"cards":[{"id":"x"', expected: pfJson() }),
  fx({ name: 'json-trailing-comma', raw: '{"cards":[{"id":"a","topicId":"t","type":"MINI_GAME","content":{"gameType":"CATEGORY_SORT","categories":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"items":[{"id":"i","label":"I","categoryId":"a"}]},"difficulty":1},]}', expected: pfJson() }),

  // ----- parse:zod-shape (8) -----
  fx({ name: 'shape-empty-cards', raw: ser({ cards: [] }), expected: pfShape() }),
  fx({ name: 'shape-wrong-game-type', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).gameType = 'SEQUENCE_BUILD'; }), expected: pfShape() }),
  fx({ name: 'shape-wrong-card-type', raw: mut(validBase, (d) => { d.cards[0].type = 'FLASHCARD'; }), expected: pfShape() }),
  fx({ name: 'shape-one-category', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).categories = [{ id: 'a', label: 'A' }]; }), expected: pfShape() }),
  fx({ name: 'shape-zero-items', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).items = []; }), expected: pfShape() }),
  fx({ name: 'shape-category-extra-key', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).categories as Array<Record<string, unknown>>)[0].extra = 'no'; }), expected: pfShape() }),
  fx({ name: 'shape-item-missing-categoryId', raw: mut(validBase, (d) => { delete ((d.cards[0].content as Record<string, unknown>).items as Array<Record<string, unknown>>)[0].categoryId; }), expected: pfShape() }),
  fx({ name: 'shape-difficulty-out-of-range', raw: mut(validBase, (d) => { d.cards[0].difficulty = 0; }), expected: pfShape() }),

  // ----- semantic-fail (5) -----
  fx({ name: 'semantic-duplicate-category-id', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).categories as Array<Record<string, unknown>>)[1].id = 'cat-mammal'; }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-duplicate-item-id', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).items as Array<Record<string, unknown>>)[1].id = 'i-cat'; }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-item-unknown-category', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).items as Array<Record<string, unknown>>)[0].categoryId = 'cat-not-declared'; }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-category-with-no-items', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).items as Array<Record<string, unknown>>).forEach((it) => { it.categoryId = 'cat-mammal'; }); }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-second-category-empty', raw: ser({ cards: [{
    ...validCard(),
    content: {
      gameType: 'CATEGORY_SORT',
      categories: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      items: [
        { id: 'i1', label: 'I1', categoryId: 'a' },
        { id: 'i2', label: 'I2', categoryId: 'a' },
      ],
    },
  }] }), expected: sf('validation:semantic-mini-game-playability') }),
];
