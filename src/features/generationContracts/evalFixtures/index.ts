/**
 * Public surface for `src/features/generationContracts/evalFixtures`.
 *
 * Re-exported by the module-level barrel (`../index.ts`). Direct
 * imports of `./evalFixtures/<file>` from outside this directory are
 * not allowed — the only import path is the module-level barrel.
 */

export { EVAL_FIXTURES_BY_KIND, fixturesForKind } from './byKind';
export { runFixture, type EvalFixtureRunResult } from './runFixture';
export type {
  EvalFixture,
  EvalFixturesByKind,
  EvalOutcome,
} from './types';
