import { describe, expect, it } from 'vitest';

import type { ArtifactKind } from '../artifacts/types';
import { EVAL_FIXTURES_BY_KIND } from './byKind';
import { runFixture } from './runFixture';
import type { EvalFixture } from './types';

const ALL_KINDS: ArtifactKind[] = [
  'subject-graph-topics',
  'subject-graph-edges',
  'topic-theory',
  'topic-study-cards',
  'topic-mini-game-category-sort',
  'topic-mini-game-sequence-build',
  'topic-mini-game-match-pairs',
  'topic-expansion-cards',
  'crystal-trial',
];

describe('golden eval harness covers every ArtifactKind', () => {
  it('EVAL_FIXTURES_BY_KIND has exactly one entry per kind', () => {
    expect(Object.keys(EVAL_FIXTURES_BY_KIND).sort()).toEqual(
      [...ALL_KINDS].sort(),
    );
  });

  for (const kind of ALL_KINDS) {
    const fixtures = EVAL_FIXTURES_BY_KIND[kind];
    it(`${kind}: ships ≥25 fixtures across all four outcome categories`, () => {
      expect(fixtures.length).toBeGreaterThanOrEqual(25);
      const accepts = fixtures.filter(
        (f) => f.expected.outcome === 'accept',
      ).length;
      const parseJson = fixtures.filter(
        (f) =>
          f.expected.outcome === 'parse-fail' &&
          f.expected.failureCode === 'parse:json-mode-violation',
      ).length;
      const parseShape = fixtures.filter(
        (f) =>
          f.expected.outcome === 'parse-fail' &&
          f.expected.failureCode === 'parse:zod-shape',
      ).length;
      const semantic = fixtures.filter(
        (f) => f.expected.outcome === 'semantic-fail',
      ).length;
      expect(accepts).toBeGreaterThanOrEqual(5);
      expect(parseJson).toBeGreaterThanOrEqual(3);
      expect(parseShape).toBeGreaterThanOrEqual(5);
      expect(semantic).toBeGreaterThanOrEqual(3);
    });
  }
});

describe.each(ALL_KINDS)('eval harness: %s', (kind) => {
  const fixtures = EVAL_FIXTURES_BY_KIND[kind] as readonly EvalFixture[];

  it('every fixture has a unique name', () => {
    const names = fixtures.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))(
    '%s',
    (_name: string, fixture: EvalFixture) => {
      const result = runFixture(kind, fixture);
      if (!result.ok) {
        throw new Error(
          `[${kind}/${fixture.name}] ${result.reason}\n  expected: ${JSON.stringify(fixture.expected)}`,
        );
      }
      expect(result.ok).toBe(true);
    },
  );
});
