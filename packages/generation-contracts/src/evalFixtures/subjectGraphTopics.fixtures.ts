/**
 * Golden eval fixtures for the `subject-graph-topics` artifact (Stage A).
 *
 * Coverage matrix (locked by the harness floor in evalHarness.test.ts):
 *   - 8 accept fixtures across allowed icon names, tier mixes, and
 *     identifier shapes.
 *   - 5 parse:json-mode-violation fixtures covering markdown fences,
 *     leading/trailing prose, malformed JSON.
 *   - 8 parse:zod-shape fixtures covering empty arrays, missing keys,
 *     extra keys on .strict() objects, and primitive-type violations.
 *   - 5 semantic-fail fixtures for the three Stage A semantic codes:
 *     icon-allowlist drift, duplicate topicId, duplicate title
 *     (case-insensitive). Each emits `validation:semantic-subject-graph`.
 */

import { acc, fx, mut, pfJson, pfShape, ser, sf } from './_helpers';
import type { EvalFixture } from './types';

type Topic = {
  topicId: string;
  title: string;
  iconName: string;
  tier: number;
  learningObjective: string;
};

const topic = (
  topicId: string,
  title: string,
  iconName: string,
  tier = 1,
  learningObjective = 'Learn the fundamentals.',
): Topic => ({ topicId, title, iconName, tier, learningObjective });

const validBase: { topics: Topic[] } = {
  topics: [
    topic('intro-x', 'Intro to X', 'atom', 1, 'Understand X basics.'),
    topic('core-y', 'Core of Y', 'beaker', 1, 'Apply Y essentials.'),
    topic('adv-z', 'Advanced Z', 'binary', 2, 'Master Z patterns.'),
    topic('sys-q', 'Systems of Q', 'brain', 2, 'Reason about Q systems.'),
  ],
};

export const subjectGraphTopicsFixtures: ReadonlyArray<EvalFixture> = [
  // ----- accept (8) -----
  fx({ name: 'accept-single-topic', raw: ser({ topics: [topic('only-one', 'Only One', 'atom')] }), expected: acc() }),
  fx({ name: 'accept-multi-topic', raw: ser(validBase), expected: acc() }),
  fx({ name: 'accept-tier-five', raw: mut(validBase, (d) => { d.topics[3].tier = 5; }), expected: acc() }),
  fx({ name: 'accept-icon-rocket', raw: ser({ topics: [topic('topic-a', 'Topic A', 'rocket')] }), expected: acc() }),
  fx({ name: 'accept-icon-scale', raw: ser({ topics: [topic('topic-a', 'Topic A', 'scale')] }), expected: acc() }),
  fx({ name: 'accept-icon-graduation-cap', raw: ser({ topics: [topic('topic-a', 'Topic A', 'graduation-cap')] }), expected: acc() }),
  fx({ name: 'accept-numeric-id-segment', raw: ser({ topics: [topic('topic-1', 'First Topic', 'sigma')] }), expected: acc() }),
  fx({ name: 'accept-long-objective', raw: ser({ topics: [topic('topic-a', 'Topic A', 'lightbulb', 1, 'Detailed objective. '.repeat(20).trim())] }), expected: acc() }),

  // ----- parse:json-mode-violation (5) -----
  fx({ name: 'json-markdown-fence', raw: '```json\n' + ser(validBase) + '\n```', expected: pfJson() }),
  fx({ name: 'json-leading-prose', raw: 'Here is the result: ' + ser(validBase), expected: pfJson() }),
  fx({ name: 'json-trailing-prose', raw: ser(validBase) + '\n\nThanks!', expected: pfJson() }),
  fx({ name: 'json-trailing-comma', raw: '{"topics":[{"topicId":"a","title":"A","iconName":"atom","tier":1,"learningObjective":"L"},]}', expected: pfJson() }),
  fx({ name: 'json-truncated', raw: '{"topics":[', expected: pfJson() }),

  // ----- parse:zod-shape (8) -----
  fx({ name: 'shape-empty-topics', raw: ser({ topics: [] }), expected: pfShape() }),
  fx({ name: 'shape-missing-topics-key', raw: ser({}), expected: pfShape() }),
  fx({ name: 'shape-extra-root-key', raw: mut(validBase, (d) => { (d as Record<string, unknown>).extraField = 'no'; }), expected: pfShape() }),
  fx({ name: 'shape-extra-topic-key', raw: mut(validBase, (d) => { (d.topics[0] as Record<string, unknown>).extraField = 'no'; }), expected: pfShape() }),
  fx({ name: 'shape-tier-zero', raw: mut(validBase, (d) => { d.topics[0].tier = 0; }), expected: pfShape() }),
  fx({ name: 'shape-tier-fractional', raw: mut(validBase, (d) => { d.topics[0].tier = 1.5; }), expected: pfShape() }),
  fx({ name: 'shape-empty-title', raw: mut(validBase, (d) => { d.topics[0].title = ''; }), expected: pfShape() }),
  fx({ name: 'shape-bad-kebab-uppercase', raw: mut(validBase, (d) => { d.topics[0].topicId = 'BadId'; }), expected: pfShape() }),

  // ----- semantic-fail (5) -----
  fx({ name: 'semantic-icon-not-allowlisted', raw: mut(validBase, (d) => { d.topics[0].iconName = 'not-an-icon'; }), expected: sf('validation:semantic-subject-graph') }),
  fx({ name: 'semantic-icon-typo', raw: mut(validBase, (d) => { d.topics[0].iconName = 'atomic'; }), expected: sf('validation:semantic-subject-graph') }),
  fx({ name: 'semantic-duplicate-topic-id', raw: mut(validBase, (d) => { d.topics[1].topicId = d.topics[0].topicId; }), expected: sf('validation:semantic-subject-graph') }),
  fx({ name: 'semantic-duplicate-title-exact', raw: mut(validBase, (d) => { d.topics[1].title = d.topics[0].title; }), expected: sf('validation:semantic-subject-graph') }),
  fx({ name: 'semantic-duplicate-title-case-insensitive', raw: mut(validBase, (d) => { d.topics[1].title = d.topics[0].title.toUpperCase() + ' '; }), expected: sf('validation:semantic-subject-graph') }),
];
