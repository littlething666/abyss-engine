/**
 * Golden eval fixtures for the `subject-graph-edges` artifact (Stage B).
 *
 * Coverage matrix:
 *   - 7 accept fixtures (empty edge set is valid at schema level;
 *     fan-in/out, optional minLevel).
 *   - 5 parse:json-mode-violation fixtures.
 *   - 8 parse:zod-shape fixtures (extra keys on .strict() edges,
 *     missing target/source, non-kebab ids, minLevel range, ...).
 *   - 6 semantic-fail fixtures: missing context, self-loop, unknown
 *     source, unknown target, exact dup pair, dup pair with
 *     different minLevel. All emit `validation:semantic-subject-graph`.
 */

import { acc, fx, pfJson, pfShape, ser, sf } from './_helpers';
import type { EvalFixture } from './types';

const lattice = ['intro-x', 'core-y', 'adv-z', 'sys-q', 'meta-p'];
const ctx = { latticeTopicIds: lattice };

const edge = (source: string, target: string, minLevel?: number) =>
  minLevel === undefined ? { source, target } : { source, target, minLevel };

export const subjectGraphEdgesFixtures: ReadonlyArray<EvalFixture> = [
  // ----- accept (7) -----
  fx({ name: 'accept-empty-edges', raw: ser({ edges: [] }), expected: acc(), context: ctx }),
  fx({ name: 'accept-single-edge', raw: ser({ edges: [edge('intro-x', 'core-y')] }), expected: acc(), context: ctx }),
  fx({ name: 'accept-chain', raw: ser({ edges: [edge('intro-x', 'core-y'), edge('core-y', 'adv-z'), edge('adv-z', 'sys-q')] }), expected: acc(), context: ctx }),
  fx({ name: 'accept-with-min-level-3', raw: ser({ edges: [edge('intro-x', 'core-y', 3)] }), expected: acc(), context: ctx }),
  fx({ name: 'accept-fan-out', raw: ser({ edges: [edge('intro-x', 'core-y'), edge('intro-x', 'adv-z'), edge('intro-x', 'sys-q')] }), expected: acc(), context: ctx }),
  fx({ name: 'accept-fan-in', raw: ser({ edges: [edge('core-y', 'meta-p'), edge('adv-z', 'meta-p'), edge('sys-q', 'meta-p')] }), expected: acc(), context: ctx }),
  fx({ name: 'accept-min-level-1', raw: ser({ edges: [edge('intro-x', 'core-y', 1)] }), expected: acc(), context: ctx }),

  // ----- parse:json-mode-violation (5) -----
  fx({ name: 'json-markdown-fence', raw: '```\n{"edges":[]}\n```', expected: pfJson() }),
  fx({ name: 'json-trailing-comma', raw: '{"edges":[{"source":"a","target":"b"},]}', expected: pfJson() }),
  fx({ name: 'json-truncated', raw: '{"edges":[{"source":"a"', expected: pfJson() }),
  fx({ name: 'json-single-quotes', raw: "{'edges':[]}", expected: pfJson() }),
  fx({ name: 'json-empty-string', raw: '', expected: pfJson() }),

  // ----- parse:zod-shape (8) -----
  fx({ name: 'shape-missing-edges-key', raw: ser({}), expected: pfShape() }),
  fx({ name: 'shape-extra-root-key', raw: ser({ edges: [], extra: 1 }), expected: pfShape() }),
  fx({ name: 'shape-edge-extra-key', raw: ser({ edges: [{ source: 'a', target: 'b', label: 'no' }] }), expected: pfShape() }),
  fx({ name: 'shape-edge-missing-target', raw: ser({ edges: [{ source: 'a' }] }), expected: pfShape() }),
  fx({ name: 'shape-source-not-kebab', raw: ser({ edges: [{ source: 'BadSource', target: 'a' }] }), expected: pfShape() }),
  fx({ name: 'shape-min-level-zero', raw: ser({ edges: [{ source: 'a', target: 'b', minLevel: 0 }] }), expected: pfShape() }),
  fx({ name: 'shape-min-level-fractional', raw: ser({ edges: [{ source: 'a', target: 'b', minLevel: 1.5 }] }), expected: pfShape() }),
  fx({ name: 'shape-source-empty-string', raw: ser({ edges: [{ source: '', target: 'a' }] }), expected: pfShape() }),

  // ----- semantic-fail (6) -----
  fx({ name: 'semantic-missing-context', raw: ser({ edges: [edge('intro-x', 'core-y')] }), expected: sf('validation:semantic-subject-graph') }),
  fx({ name: 'semantic-self-loop', raw: ser({ edges: [edge('intro-x', 'intro-x')] }), expected: sf('validation:semantic-subject-graph'), context: ctx }),
  fx({ name: 'semantic-unknown-source', raw: ser({ edges: [edge('not-in-lattice', 'core-y')] }), expected: sf('validation:semantic-subject-graph'), context: ctx }),
  fx({ name: 'semantic-unknown-target', raw: ser({ edges: [edge('intro-x', 'not-in-lattice')] }), expected: sf('validation:semantic-subject-graph'), context: ctx }),
  fx({ name: 'semantic-duplicate-pair-exact', raw: ser({ edges: [edge('intro-x', 'core-y'), edge('intro-x', 'core-y')] }), expected: sf('validation:semantic-subject-graph'), context: ctx }),
  fx({ name: 'semantic-duplicate-pair-different-min-levels', raw: ser({ edges: [edge('intro-x', 'core-y', 1), edge('intro-x', 'core-y', 3)] }), expected: sf('validation:semantic-subject-graph'), context: ctx }),
];
