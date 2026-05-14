/**
 * Executes a single fixture against the strict-parse +
 * semantic-validate pipeline for `kind` and returns a structured
 * pass/fail result with a debuggable reason. The vitest harness wraps
 * this in `expect(...).toBe(true)` per fixture so every red row in CI
 * carries enough context to triage without re-running locally.
 */

import type { ArtifactKind } from '../artifacts/types';
import { semanticValidateArtifact } from '../semanticValidators';
import { strictParseArtifact } from '../strictParsers';
import type { EvalFixture } from './types';

export type EvalFixtureRunResult =
  | { ok: true }
  | { ok: false; reason: string };

export function runFixture(
  kind: ArtifactKind,
  fixture: EvalFixture,
): EvalFixtureRunResult {
  const parsed = strictParseArtifact(kind, fixture.raw);

  if (fixture.expected.outcome === 'parse-fail') {
    if (parsed.ok) {
      return {
        ok: false,
        reason: `expected strictParse to fail with ${fixture.expected.failureCode}, but it succeeded`,
      };
    }
    if (parsed.failureCode !== fixture.expected.failureCode) {
      return {
        ok: false,
        reason: `expected strictParse failureCode ${fixture.expected.failureCode}, got ${parsed.failureCode} (${parsed.message})`,
      };
    }
    return { ok: true };
  }

  if (!parsed.ok) {
    return {
      ok: false,
      reason: `expected strictParse to succeed, but failed with ${parsed.failureCode}: ${parsed.message}`,
    };
  }

  const sem = semanticValidateArtifact(kind, parsed.payload, fixture.context);

  if (fixture.expected.outcome === 'accept') {
    if (!sem.ok) {
      return {
        ok: false,
        reason: `expected semantic accept, but failed with ${sem.failureCode}: ${sem.message}`,
      };
    }
    return { ok: true };
  }

  // semantic-fail
  if (sem.ok) {
    return {
      ok: false,
      reason: `expected semantic to fail with ${fixture.expected.failureCode}, but it succeeded`,
    };
  }
  if (sem.failureCode !== fixture.expected.failureCode) {
    return {
      ok: false,
      reason: `expected semantic failureCode ${fixture.expected.failureCode}, got ${sem.failureCode} (${sem.message})`,
    };
  }
  return { ok: true };
}
