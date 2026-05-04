/**
 * Golden eval fixtures for the `topic-mini-game-match-pairs` artifact.
 *
 * Semantic failures emit `validation:semantic-mini-game-playability` for
 * duplicate pair ids, duplicate `left` (case-insensitive), and duplicate
 * `right` (case-insensitive).
 */

import { acc, fx, mut, pfJson, pfShape, ser, sf } from './_helpers';
import type { EvalFixture } from './types';

type MPCard = {
  id: string;
  topicId: string;
  type: string;
  difficulty: number;
  content: Record<string, unknown>;
};

const validCard = (id = 'mp-1'): MPCard => ({
  id,
  topicId: 'topic-mp',
  type: 'MINI_GAME',
  difficulty: 2,
  content: {
    gameType: 'MATCH_PAIRS',
    pairs: [
      { id: 'p-1', left: 'Mercury', right: 'closest to sun' },
      { id: 'p-2', left: 'Venus', right: 'hottest' },
      { id: 'p-3', left: 'Earth', right: 'has life' },
    ],
  },
});

const validBase = { cards: [validCard()] };

export const topicMiniGameMatchPairsFixtures: ReadonlyArray<EvalFixture> = [
  // ----- accept (8) -----
  fx({ name: 'accept-three-pairs', raw: ser(validBase), expected: acc() }),
  fx({ name: 'accept-two-pair-min', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).pairs = [{ id: 'p1', left: 'A', right: 'a' }, { id: 'p2', left: 'B', right: 'b' }]; }), expected: acc() }),
  fx({ name: 'accept-five-pairs', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).pairs = [
    { id: 'p1', left: 'L1', right: 'R1' }, { id: 'p2', left: 'L2', right: 'R2' },
    { id: 'p3', left: 'L3', right: 'R3' }, { id: 'p4', left: 'L4', right: 'R4' }, { id: 'p5', left: 'L5', right: 'R5' },
  ]; }), expected: acc() }),
  fx({ name: 'accept-multi-card', raw: ser({ cards: [validCard('mp-1'), validCard('mp-2')] }), expected: acc() }),
  fx({ name: 'accept-difficulty-1', raw: mut(validBase, (d) => { d.cards[0].difficulty = 1; }), expected: acc() }),
  fx({ name: 'accept-difficulty-4', raw: mut(validBase, (d) => { d.cards[0].difficulty = 4; }), expected: acc() }),
  fx({ name: 'accept-similar-but-distinct', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).pairs as Array<Record<string, unknown>>)[0].left = 'Mercurial'; }), expected: acc() }),
  fx({ name: 'accept-numeric-labels', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).pairs = [{ id: 'p1', left: '1', right: 'one' }, { id: 'p2', left: '2', right: 'two' }, { id: 'p3', left: '3', right: 'three' }]; }), expected: acc() }),

  // ----- parse:json-mode-violation (5) -----
  fx({ name: 'json-markdown-fence', raw: '```\n' + ser(validBase) + '\n```', expected: pfJson() }),
  fx({ name: 'json-leading-prose', raw: 'Output:\n' + ser(validBase), expected: pfJson() }),
  fx({ name: 'json-trailing-prose', raw: ser(validBase) + '\nDone', expected: pfJson() }),
  fx({ name: 'json-truncated', raw: '{"cards":[{', expected: pfJson() }),
  fx({ name: 'json-empty-string', raw: '', expected: pfJson() }),

  // ----- parse:zod-shape (8) -----
  fx({ name: 'shape-empty-cards', raw: ser({ cards: [] }), expected: pfShape() }),
  fx({ name: 'shape-wrong-game-type', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).gameType = 'SEQUENCE_BUILD'; }), expected: pfShape() }),
  fx({ name: 'shape-one-pair', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).pairs = [{ id: 'p', left: 'L', right: 'R' }]; }), expected: pfShape() }),
  fx({ name: 'shape-pair-extra-key', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).pairs as Array<Record<string, unknown>>)[0].extra = 'no'; }), expected: pfShape() }),
  fx({ name: 'shape-pair-empty-left', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).pairs as Array<Record<string, unknown>>)[0].left = ''; }), expected: pfShape() }),
  fx({ name: 'shape-pair-missing-right', raw: mut(validBase, (d) => { delete ((d.cards[0].content as Record<string, unknown>).pairs as Array<Record<string, unknown>>)[0].right; }), expected: pfShape() }),
  fx({ name: 'shape-difficulty-zero', raw: mut(validBase, (d) => { d.cards[0].difficulty = 0; }), expected: pfShape() }),
  fx({ name: 'shape-topic-id-not-kebab', raw: mut(validBase, (d) => { d.cards[0].topicId = 'NotKebab'; }), expected: pfShape() }),

  // ----- semantic-fail (5) -----
  fx({ name: 'semantic-duplicate-pair-id', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).pairs as Array<Record<string, unknown>>)[1].id = 'p-1'; }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-duplicate-left-exact', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).pairs as Array<Record<string, unknown>>)[1].left = 'Mercury'; }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-duplicate-left-case-insensitive', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).pairs as Array<Record<string, unknown>>)[1].left = ' MERCURY '; }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-duplicate-right-exact', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).pairs as Array<Record<string, unknown>>)[1].right = 'closest to sun'; }), expected: sf('validation:semantic-mini-game-playability') }),
  fx({ name: 'semantic-duplicate-right-case-insensitive', raw: mut(validBase, (d) => { ((d.cards[0].content as Record<string, unknown>).pairs as Array<Record<string, unknown>>)[1].right = 'CLOSEST TO SUN'; }), expected: sf('validation:semantic-mini-game-playability') }),
];
