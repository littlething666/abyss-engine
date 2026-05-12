/**
 * Golden eval fixtures for the `crystal-trial` artifact.
 *
 * Semantic codes:
 *   - validation:semantic-trial-question-count (count != expectedQuestionCount)
 *   - validation:semantic-duplicate-concept     (dup question id; dup option case-insensitive)
 */

import { acc, fx, mut, pfJson, pfShape, ser, sf } from './_helpers';
import type { EvalFixture } from './types';

type Question = {
  id: string;
  category: string;
  scenario: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  sourceCardSummaries: string[];
};

const q = (i: number, category = 'interview'): Question => ({
  id: `q-${i}`,
  category,
  scenario: `Scenario ${i}`,
  question: `Question ${i}?`,
  options: [`Option A${i}`, `Option B${i}`, `Option C${i}`],
  correctAnswer: `Option A${i}`,
  explanation: `Because ${i}.`,
  sourceCardSummaries: [`Source ${i}`],
});

const validBase: { questions: Question[] } = {
  questions: [
    q(1, 'interview'),
    q(2, 'troubleshooting'),
    q(3, 'architecture'),
    q(4, 'interview'),
    q(5, 'troubleshooting'),
  ],
};

export const crystalTrialFixtures: ReadonlyArray<EvalFixture> = [
  // ----- accept (8) -----
  fx({ name: 'accept-default-five', raw: ser(validBase), expected: acc() }),
  fx({ name: 'accept-explicit-five-context', raw: ser(validBase), expected: acc(), context: { expectedQuestionCount: 5 } }),
  fx({ name: 'accept-seven-with-context', raw: ser({ questions: [q(1), q(2), q(3), q(4), q(5), q(6), q(7)] }), expected: acc(), context: { expectedQuestionCount: 7 } }),
  fx({ name: 'accept-three-with-context', raw: ser({ questions: [q(1), q(2), q(3)] }), expected: acc(), context: { expectedQuestionCount: 3 } }),
  fx({ name: 'accept-mixed-categories', raw: mut(validBase, (d) => { d.questions[0].category = 'architecture'; d.questions[1].category = 'interview'; }), expected: acc() }),
  fx({ name: 'accept-two-options-min', raw: mut(validBase, (d) => { d.questions[0].options = ['Option A1', 'Option B1']; }), expected: acc() }),
  fx({ name: 'accept-many-source-summaries', raw: mut(validBase, (d) => { d.questions[0].sourceCardSummaries = ['s1', 's2', 's3']; }), expected: acc() }),
  fx({ name: 'accept-correct-answer-case-insensitive-match', raw: mut(validBase, (d) => { d.questions[0].correctAnswer = 'OPTION A1'; }), expected: acc() }),

  // ----- parse:json-mode-violation (5) -----
  fx({ name: 'json-markdown-fence', raw: '```json\n' + ser(validBase) + '\n```', expected: pfJson() }),
  fx({ name: 'json-leading-prose', raw: 'Result:\n' + ser(validBase), expected: pfJson() }),
  fx({ name: 'json-trailing-prose', raw: ser(validBase) + '\nThanks!', expected: pfJson() }),
  fx({ name: 'json-truncated', raw: '{"questions":[', expected: pfJson() }),
  fx({ name: 'json-trailing-comma', raw: '{"questions":[{"id":"q","category":"interview","scenario":"S","question":"Q","options":["A","B"],"correctAnswer":"A","explanation":"E","sourceCardSummaries":["s"]},]}', expected: pfJson() }),

  // ----- parse:zod-shape (8) -----
  fx({ name: 'shape-empty-questions', raw: ser({ questions: [] }), expected: pfShape() }),
  fx({ name: 'shape-missing-questions-key', raw: ser({}), expected: pfShape() }),
  fx({ name: 'shape-extra-root-key', raw: mut(validBase, (d) => { (d as Record<string, unknown>).extra = 1; }), expected: pfShape() }),
  fx({ name: 'shape-question-extra-key', raw: mut(validBase, (d) => { (d.questions[0] as Record<string, unknown>).extra = 1; }), expected: pfShape() }),
  fx({ name: 'shape-bad-category', raw: mut(validBase, (d) => { d.questions[0].category = 'philosophy'; }), expected: pfShape() }),
  fx({ name: 'shape-one-option', raw: mut(validBase, (d) => { d.questions[0].options = ['only-one']; }), expected: pfShape() }),
  fx({ name: 'shape-empty-source-summaries', raw: mut(validBase, (d) => { d.questions[0].sourceCardSummaries = []; }), expected: pfShape() }),
  fx({ name: 'shape-correct-answer-not-in-options', raw: mut(validBase, (d) => { d.questions[0].correctAnswer = 'Not Listed'; }), expected: pfShape() }),

  // ----- semantic-fail (5) -----
  fx({ name: 'semantic-too-few-questions-default', raw: ser({ questions: [q(1), q(2), q(3)] }), expected: sf('validation:semantic-trial-question-count') }),
  fx({ name: 'semantic-too-many-questions-default', raw: ser({ questions: [q(1), q(2), q(3), q(4), q(5), q(6), q(7)] }), expected: sf('validation:semantic-trial-question-count') }),
  fx({ name: 'semantic-context-count-mismatch', raw: ser(validBase), expected: sf('validation:semantic-trial-question-count'), context: { expectedQuestionCount: 7 } }),
  fx({ name: 'semantic-duplicate-question-id', raw: mut(validBase, (d) => { d.questions[1].id = d.questions[0].id; }), expected: sf('validation:semantic-duplicate-concept') }),
  fx({ name: 'semantic-duplicate-option-case-insensitive', raw: mut(validBase, (d) => { d.questions[0].options = ['Same', ' SAME ', 'Other']; d.questions[0].correctAnswer = 'Same'; }), expected: sf('validation:semantic-duplicate-concept') }),
];
