/**
 * Golden eval fixtures for the `topic-mini-game-sequence-build` artifact.
 *
 * Semantic failures emit `validation:semantic-mini-game-playability` for
 * duplicate step ids and orderings that are not exactly `{1..N}`.
 */

import { acc, fx, mut, pfJson, pfShape, ser, sf } from './_helpers';
import type { EvalFixture } from './types';

type SBCard = {
  id: string;
  topicId: string;
  type: string;
  difficulty: number;
  content: Record<string, unknown>;
};

const validCard = (id = 'sb-1'): SBCard => ({
  id,
  topicId: 'topic-sb',
  type: 'MINI_GAME',
  difficulty: 2,
  content: {
    gameType: 'SEQUENCE_BUILD',
    steps: [
      { id: 'step-1', label: 'Boot', order: 1 },
      { id: 'step-2', label: 'Auth', order: 2 },
      { id: 'step-3', label: 'Render', order: 3 },
    ],
  },
});

const validBase = { cards: [validCard()] };

export const topicMiniGameSequenceBuildFixtures: ReadonlyArray<EvalFixture> = [
  // ----- accept (8) -----
  fx({ name: 'accept-three-step-sequence', raw: ser(validBase), expected: acc() }),
  fx({ name: 'accept-two-step-min', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).steps = [{ id: 's1', label: 'A', order: 1 }, { id: 's2', label: 'B', order: 2 }]; }), expected: acc() }),
  fx({ name: 'accept-five-step-sequence', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).steps = [
    { id: 's1', label: 'A', order: 1 }, { id: 's2', label: 'B', order: 2 },
    { id: 's3', label: 'C', order: 3 }, { id: 's4', label: 'D', order: 4 }, { id: 's5', label: 'E', order: 5 },
  ]; }), expected: acc() }),
  fx({ name: 'accept-multi-card', raw: ser({ cards: [validCard('sb-1'), validCard('sb-2')] }), expected: acc() }),
  fx({ name: 'accept-orders-out-of-array-order', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).steps = [{ id: 'a', label: 'A', order: 3 }, { id: 'b', label: 'B', order: 1 }, { id: 'c', label: 'C', order: 2 }]; }), expected: acc() }),
  fx({ name: 'accept-difficulty-1', raw: mut(validBase, (d) => { d.cards[0].difficulty = 1; }), expected: acc() }),
  fx({ name: 'accept-difficulty-4', raw: mut(validBase, (d) => { d.cards[0].difficulty = 4; }), expected: acc() }),
  fx({ name: 'accept-distinct-labels', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).steps as Array<Record<string, unknown>>)[0].label = 'Init system'; }), expected: acc() }),

  // ----- parse:json-mode-violation (5) -----
  fx({ name: 'json-markdown-fence', raw: '```\n' + ser(validBase) + '\n```', expected: pfJson() }),
  fx({ name: 'json-leading-prose', raw: 'Result: ' + ser(validBase), expected: pfJson() }),
  fx({ name: 'json-trailing-prose', raw: ser(validBase) + ' end', expected: pfJson() }),
  fx({ name: 'json-truncated', raw: '{"cards":[', expected: pfJson() }),
  fx({ name: 'json-trailing-comma-steps', raw: '{"cards":[{"id":"a","topicId":"t","type":"MINI_GAME","content":{"gameType":"SEQUENCE_BUILD","steps":[{"id":"s","label":"S","order":1},]},"difficulty":1}]}', expected: pfJson() }),

  // ----- parse:zod-shape (8) -----
  fx({ name: 'shape-empty-cards', raw: ser({ cards: [] }), expected: pfShape() }),
  fx({ name: 'shape-wrong-game-type', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).gameType = 'CATEGORY_SORT'; }), expected: pfShape() }),
  fx({ name: 'shape-one-step', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).steps = [{ id: 's', label: 'S', order: 1 }]; }), expected: pfShape() }),
  fx({ name: 'shape-step-order-zero', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).steps as Array<Record<string, unknown>>)[0].order = 0; }), expected: pfShape() }),
  fx({ name: 'shape-step-order-fractional', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).steps as Array<Record<string, unknown>>)[0].order = 1.5; }), expected: pfShape() }),
  fx({ name: 'shape-step-extra-key', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).steps as Array<Record<string, unknown>>)[0].extra = 'no'; }), expected: pfShape() }),
  fx({ name: 'shape-step-empty-label', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).steps as Array<Record<string, unknown>>)[0].label = ''; }), expected: pfShape() }),
  fx({ name: 'shape-difficulty-out-of-range', raw: mut(validBase, (d) => { d.cards[0].difficulty = 5; }), expected: pfShape() }),

  // ----- semantic-fail (5) -----
  fx({ name: 'semantic-duplicate-step-id', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).steps as Array<Record<string, unknown>>)[1].id = 'step-1'; }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-orders-have-gap', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).steps as Array<Record<string, unknown>>)[2].order = 5; }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-orders-duplicate', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).steps as Array<Record<string, unknown>>)[1].order = 1; }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-orders-start-at-2', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).steps as Array<Record<string, unknown>>).forEach((s, i) => { s.order = i + 2; }); }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-orders-multi-skip', raw: mut(validBase, (d) => { const steps = (d.cards[0].content as Record<string, unknown>).steps as Array<Record<string, unknown>>; steps[0].order = 2; steps[1].order = 4; steps[2].order = 6; }), expected: sf('validation:semantic-mini-game-playability') }),
];
