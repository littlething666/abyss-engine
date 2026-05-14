/**
 * Public types for the golden eval fixture harness.
 *
 * Fixtures are stored in TypeScript (NOT JSON-on-disk) so deliberately
 * malformed `raw` strings — markdown fences, embedded prose, trailing
 * commas, truncated JSON — can be embedded literally without a JSON
 * loader rejecting them. Each fixture declares its expected outcome at
 * every stage of the strict pipeline:
 *
 *   1. `accept`        — strictParseArtifact OK, semanticValidateArtifact OK
 *   2. `parse-fail`    — strictParseArtifact fails with `failureCode`
 *   3. `semantic-fail` — strictParseArtifact OK, semanticValidateArtifact fails with `failureCode`
 *
 * The harness in `evalHarness.test.ts` runs every fixture through both
 * stages for the owning `ArtifactKind` and asserts the actual outcome
 * matches `expected` bit-for-bit. This keeps the contracts boundary
 * honest: any accidental relaxation of a strict schema, missing
 * semantic check, or drift in failure-code identity flips the relevant
 * fixture from green to red the next time CI runs.
 */

import type { ArtifactKind } from '../artifacts/types';
import type {
  SemanticFailureCode,
  SemanticValidatorContext,
} from '../semanticValidators';
import type { StrictParseFailureCode } from '../strictParsers/strictParse';

export type EvalOutcome =
  | { outcome: 'accept' }
  | { outcome: 'parse-fail'; failureCode: StrictParseFailureCode }
  | { outcome: 'semantic-fail'; failureCode: SemanticFailureCode };

export interface EvalFixture {
  /** Stable identifier; used as the test name. */
  name: string;
  /** Optional human description. */
  description?: string;
  /** Raw payload as it would arrive from the LLM (pre-parse). */
  raw: string;
  /** Expected pipeline outcome. */
  expected: EvalOutcome;
  /**
   * Optional context passed to the semantic validator. Only meaningful
   * when `expected.outcome` is `accept` or `semantic-fail`.
   */
  context?: SemanticValidatorContext;
}

export type EvalFixturesByKind = Record<
  ArtifactKind,
  ReadonlyArray<EvalFixture>
>;
