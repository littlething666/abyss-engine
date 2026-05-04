/**
 * Golden eval fixtures for the `topic-expansion-cards` artifact.
 *
 * Same envelope as `topic-study-cards` so the strict schema and
 * card-content shape semantic checks are identical. The only
 * additional semantic dimension is dedup against
 * `context.existingConceptStems`.
 */

import { acc, fx, mut, pfJson, pfShape, ser, sf } from './_helpers';
import type { EvalFixture } from './types';

type ExpCard = {
  id: string;
  topicId: string;
  type: string;
  content: Record<string, unknown>;
  difficulty: number;
};

const flash = (i: number, tier = 1): ExpCard => ({
  id: `exp-flash-${i}`,
  topicId: 'topic-exp',
  type: 'FLASHCARD',
  content: { front: `Expansion front ${i}`, back: `Back ${i}` },
  difficulty: tier,
});
const cloze = (i: number, tier = 2): ExpCard => ({
  id: `exp-cloze-${i}`,
  topicId: 'topic-exp',
  type: 'CLOZE',
  content: { text: `Cloze ${i} [B].`, blanks: [`b-${i}`] },
  difficulty: tier,
});
const mcq = (i: number, tier = 3): ExpCard => ({
  id: `exp-mcq-${i}`,
  topicId: 'topic-exp',
  type: 'MULTIPLE_CHOICE',
  content: { question: `Q ${i}`, options: [`a-${i}`, `b-${i}`], correctAnswer: `a-${i}` },
  difficulty: tier,
});

const validBase: { cards: ExpCard[] } = {
  cards: [
    flash(1, 1), flash(2, 1), flash(3, 2), flash(4, 2),
    cloze(5, 3), cloze(6, 3), mcq(7, 4), mcq(8, 4),
  ],
};

export const topicExpansionCardsFixtures: ReadonlyArray<EvalFixture> = [
  // ----- accept (8) -----
  fx({ name: 'accept-eight-mixed-no-context', raw: ser(validBase), expected: acc() }),
  fx({ name: 'accept-eight-mixed-empty-stems', raw: ser(validBase), expected: acc(), context: { existingConceptStems: [] } }),
  fx({ name: 'accept-eight-mixed-stems-no-overlap', raw: ser(validBase), expected: acc(), context: { existingConceptStems: ['unrelated stem one', 'another'] } }),
  fx({ name: 'accept-twelve-mixed', raw: ser({ cards: [...validBase.cards, flash(9, 1), flash(10, 2), cloze(11, 3), mcq(12, 4)] }), expected: acc() }),
  fx({ name: 'accept-min-pool-override-2', raw: ser({ cards: [flash(1, 1), flash(2, 2)] }), expected: acc(), context: { minCardPoolSize: 2 } }),
  fx({ name: 'accept-all-flashcard-mixed-tiers', raw: ser({ cards: [flash(1,1),flash(2,1),flash(3,2),flash(4,2),flash(5,3),flash(6,3),flash(7,4),flash(8,4)] }), expected: acc() }),
  fx({ name: 'accept-mcq-three-options', raw: mut(validBase, (d) => { d.cards[6].content = { question: 'Distinct Q seven', options: ['alpha','beta','gamma'], correctAnswer: 'beta' }; }), expected: acc() }),
  fx({ name: 'accept-cloze-multi-blank', raw: mut(validBase, (d) => { d.cards[4].content = { text: 'A [B1] then [B2].', blanks: ['x', 'y'] }; }), expected: acc() }),

  // ----- parse:json-mode-violation (5) -----
  fx({ name: 'json-markdown-fence', raw: '```\n' + ser(validBase) + '\n```', expected: pfJson() }),
  fx({ name: 'json-leading-prose', raw: 'OK:\n' + ser(validBase), expected: pfJson() }),
  fx({ name: 'json-trailing-comma', raw: '{"cards":[{"id":"a","topicId":"t","type":"FLASHCARD","content":{"front":"F","back":"B"},"difficulty":1},]}', expected: pfJson() }),
  fx({ name: 'json-truncated', raw: '{"cards":', expected: pfJson() }),
  fx({ name: 'json-empty-string', raw: '', expected: pfJson() }),

  // ----- parse:zod-shape (8) -----
  fx({ name: 'shape-empty-cards', raw: ser({ cards: [] }), expected: pfShape() }),
  fx({ name: 'shape-missing-cards-key', raw: ser({}), expected: pfShape() }),
  fx({ name: 'shape-extra-root-key', raw: mut(validBase, (d) => { (d as Record<string, unknown>).extra = 1; }), expected: pfShape() }),
  fx({ name: 'shape-extra-card-key', raw: mut(validBase, (d) => { (d.cards[0] as Record<string, unknown>).extra = 1; }), expected: pfShape() }),
  fx({ name: 'shape-card-bad-type', raw: mut(validBase, (d) => { d.cards[0].type = 'MINI_GAME'; }), expected: pfShape() }),
  fx({ name: 'shape-difficulty-zero', raw: mut(validBase, (d) => { d.cards[0].difficulty = 0; }), expected: pfShape() }),
  fx({ name: 'shape-difficulty-five', raw: mut(validBase, (d) => { d.cards[0].difficulty = 5; }), expected: pfShape() }),
  fx({ name: 'shape-topic-id-not-kebab', raw: mut(validBase, (d) => { d.cards[0].topicId = 'NotKebab'; }), expected: pfShape() }),

  // ----- semantic-fail (6) -----
  fx({ name: 'semantic-pool-size-too-small', raw: ser({ cards: validBase.cards.slice(0, 4) }), expected: sf('validation:semantic-card-pool-size') }),
  fx({ name: 'semantic-duplicate-card-id', raw: mut(validBase, (d) => { d.cards[1].id = d.cards[0].id; }), expected: sf('validation:semantic-duplicate-concept') }),
  fx({ name: 'semantic-duplicate-stem-against-existing', raw: ser(validBase), expected: sf('validation:semantic-duplicate-concept'), context: { existingConceptStems: ['expansion front 1'] } }),
  fx({ name: 'semantic-duplicate-stem-multi-existing', raw: ser(validBase), expected: sf('validation:semantic-duplicate-concept'), context: { existingConceptStems: ['unrelated', 'expansion front 4'] } }),
  fx({ name: 'semantic-flat-difficulty-distribution', raw: ser({ cards: validBase.cards.map((c) => ({ ...c, difficulty: 1 })) }), expected: sf('validation:semantic-difficulty-distribution') }),
  fx({ name: 'semantic-flashcard-back-non-string', raw: mut(validBase, (d) => { (d.cards[0].content as Record<string, unknown>).back = 123; }), expected: sf('validation:semantic-card-content-shape') }),
];
