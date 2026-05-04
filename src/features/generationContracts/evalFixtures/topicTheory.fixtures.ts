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
  fx({ name: '