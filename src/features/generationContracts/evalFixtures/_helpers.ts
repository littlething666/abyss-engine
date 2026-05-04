/**
 * Internal builders shared by every per-kind fixture file.
 *
 * Each fixture body stays a 2-3 line declaration via `fx({ ... })`. The
 * `mut` helper deep-clones a base valid object via JSON round-trip and
 * applies a mutator before stringifying — this keeps the diff between
 * an accept fixture and a derived semantic-fail or zod-shape fixture
 * localized to one or two lines.
 */

import type {
  SemanticFailureCode,
  SemanticValidatorContext,
} from '../semanticValidators';
import type { StrictParseFailureCode } from '../strictParsers/strictParse';
import type { EvalFixture, EvalOutcome } from './types';

/** `accept` outcome. */
export const acc = (): EvalOutcome => ({ outcome: 'accept' });

/** `parse-fail` outcome with `parse:json-mode-violation`. */
export const pfJson = (): EvalOutcome => ({
  outcome: 'parse-fail',
  failureCode: 'parse:json-mode-violation',
});

/** `parse-fail` outcome with `parse:zod-shape`. */
export const pfShape = (): EvalOutcome => ({
  outcome: 'parse-fail',
  failureCode: 'parse:zod-shape',
});

/** Arbitrary `parse-fail` outcome. */
export const pf = (failureCode: StrictParseFailureCode): EvalOutcome => ({
  outcome: 'parse-fail',
  failureCode,
});

/** `semantic-fail` outcome. */
export const sf = (failureCode: SemanticFailureCode): EvalOutcome => ({
  outcome: 'semantic-fail',
  failureCode,
});

/**
 * Deep-clone a JSON-shaped value via JSON round-trip, apply a mutation,
 * and stringify the result. JSON parse/stringify is intentional —
 * fixture payloads are pure JSON by construction so we don't need
 * `structuredClone` semantics for `Date`, `Map`, etc.
 */
export function mut<T>(base: T, fn: (draft: T) => void): string {
  const draft = JSON.parse(JSON.stringify(base)) as T;
  fn(draft);
  return JSON.stringify(draft);
}

/** Stringify a JSON-shaped value (for accept fixtures). */
export function ser<T>(payload: T): string {
  return JSON.stringify(payload);
}

/** Construct a fixture record. */
export function fx(args: {
  name: string;
  raw: string;
  expected: EvalOutcome;
  description?: string;
  context?: SemanticValidatorContext;
}): EvalFixture {
  return args;
}
