/**
 * Golden eval fixtures for the `topic-theory` artifact.
 *
 * Coverage matrix:
 *   - 8 accept fixtures (4 takeaways floor, multi-tier syllabus, ...).
 *   - 5 parse:json-mode-violation fixtures.
 *   - 8 parse:zod-shape fixtures (missing keys, <4 takeaways, empty
 *     bucket, extra/unknown tier key, ...).
 *   - 5 semantic-fail fixtures for `validation:semantic-duplicate-concept`
 *     covering takeaways and per-tier syllabus dedup.
 */

import { acc, fx, mut, pfJson, pfShape, ser, sf } from './_helpers';
import type { EvalFixture } from './types';

type Theory = {
  coreConcept: string;
  theory: string;
  keyTakeaways: string[];
  coreQuestionsByDifficulty: Record<string, string[]>;
};

const validBase: Theory = {
  coreConcept: 'Tail recursion lets a compiler reuse the current stack frame.',
  theory: 'When the recursive call is the last action of a function, the runtime can replace the current frame in place rather than pushing a new one.',
  keyTakeaways: [
    'Tail calls reuse the caller frame.',
    'Compilers must opt in to TCO.',
    'Mutual recursion can be tail-optimized via trampolining.',
    'Loops compile to identical code as TCO recursion.',
  ],
  coreQuestionsByDifficulty: {
    '1': ['What is tail recursion?'],
    '2': ['Why does TCO require the call to be in tail position?'],
    '3': ['How does mutual recursion get tail-optimized?'],
    '4': ['When does TCO interact badly with debugging?'],
  },
};

export const topicTheoryFixtures: ReadonlyArray<EvalFixture> = [
  // ----- accept (8) -----
  fx({ name: 'accept-base', raw: ser(validBase), expected: acc() }),
  fx({ name: 'accept-five-takeaways', raw: mut(validBase, (d) => { d.keyTakeaways.push('Continuation-passing style is the limit.'); }), expected: acc() }),
  fx({ name: 'accept-six-takeaways', raw: mut(validBase, (d) => { d.keyTakeaways.push('Alpha takeaway.', 'Beta takeaway.'); }), expected: acc() }),
  fx({ name: 'accept-multi-question-buckets', raw: mut(validBase, (d) => { d.coreQuestionsByDifficulty['1'].push('Define TCO.'); d.coreQuestionsByDifficulty['4'].push('Compare to CPS.'); }), expected: acc() }),
  fx({ name: 'accept-long-theory', raw: mut(validBase, (d) => { d.theory = d.theory + ' ' + 'Detailed exposition. '.repeat(40).trim(); }), expected: acc() }),
  fx({ name: 'accept-questions-distinct-across-tiers', raw: mut(validBase, (d) => { d.coreQuestionsByDifficulty['2'].push('What is tail recursion?'); }), expected: acc() }),
  fx({ name: 'accept-near-duplicate-different-words', raw: mut(validBase, (d) => { d.keyTakeaways[0] = 'Tail position is the only TCO-safe call site.'; }), expected: acc() }),
  fx({ name: 'accept-distinct-questions-same-tier', raw: mut(validBase, (d) => { d.coreQuestionsByDifficulty['1'] = ['What is tail recursion?', 'When does the compiler decline TCO?']; }), expected: acc() }),

  // ----- parse:json-mode-violation (5) -----
  fx({ name: 'json-markdown-fence-with-lang', raw: '```json\n' + ser(validBase) + '\n```', expected: pfJson() }),
  fx({ name: 'json-leading-prose', raw: 'Here you go:\n' + ser(validBase), expected: pfJson() }),
  fx({ name: 'json-trailing-prose', raw: ser(validBase) + '\nLet me know.', expected: pfJson() }),
  fx({ name: 'json-truncated', raw: ser(validBase).slice(0, 80), expected: pfJson() }),
  fx({ name: 'json-html-tag-wrapper', raw: '<json>' + ser(validBase) + '</json>', expected: pfJson() }),

  // ----- parse:zod-shape (8) -----
  fx({ name: 'shape-missing-coreConcept', raw: mut(validBase, (d) => { delete (d as Record<string, unknown>).coreConcept; }), expected: pfShape() }),
  fx({ name: 'shape-empty-theory', raw: mut(validBase, (d) => { d.theory = ''; }), expected: pfShape() }),
  fx({ name: 'shape-three-takeaways', raw: mut(validBase, (d) => { d.keyTakeaways = d.keyTakeaways.slice(0, 3); }), expected: pfShape() }),
  fx({ name: 'shape-takeaway-empty-string', raw: mut(validBase, (d) => { d.keyTakeaways[0] = ''; }), expected: pfShape() }),
  fx({ name: 'shape-questions-missing-tier-3', raw: mut(validBase, (d) => { delete (d.coreQuestionsByDifficulty as Record<string, unknown>)['3']; }), expected: pfShape() }),
  fx({ name: 'shape-questions-empty-bucket', raw: mut(validBase, (d) => { d.coreQuestionsByDifficulty['1'] = []; }), expected: pfShape() }),
  fx({ name: 'shape-questions-extra-tier-key', raw: mut(validBase, (d) => { (d.coreQuestionsByDifficulty as Record<string, unknown>)['5'] = ['x']; }), expected: pfShape() }),
  fx({ name: 'shape-extra-root-key', raw: mut(validBase, (d) => { (d as Record<string, unknown>).extraField = 1; }), expected: pfShape() }),

  // ----- semantic-fail (5) -----
  fx({ name: 'semantic-duplicate-takeaway-exact', raw: mut(validBase, (d) => { d.keyTakeaways[1] = d.keyTakeaways[0]; }), expected: sf('validation:semantic-duplicate-concept') }),
  fx({ name: 'semantic-duplicate-takeaway-case-insensitive', raw: mut(validBase, (d) => { d.keyTakeaways[1] = d.keyTakeaways[0].toUpperCase() + '  '; }), expected: sf('validation:semantic-duplicate-concept') }),
  fx({ name: 'semantic-duplicate-question-tier-1', raw: mut(validBase, (d) => { d.coreQuestionsByDifficulty['1'].push(d.coreQuestionsByDifficulty['1'][0]); }), expected: sf('validation:semantic-duplicate-concept') }),
  fx({ name: 'semantic-duplicate-question-tier-3-case', raw: mut(validBase, (d) => { d.coreQuestionsByDifficulty['3'].push(d.coreQuestionsByDifficulty['3'][0].toUpperCase()); }), expected: sf('validation:semantic-duplicate-concept') }),
  fx({ name: 'semantic-duplicate-question-with-whitespace', raw: mut(validBase, (d) => { d.coreQuestionsByDifficulty['2'].push('  ' + d.coreQuestionsByDifficulty['2'][0] + '  '); }), expected: sf('validation:semantic-duplicate-concept') }),
];
