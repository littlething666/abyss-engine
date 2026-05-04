/**
 * Public types for the semantic-validator subsystem.
 *
 * Every validator runs AFTER the strict Zod parser as a separate single
 * pass and returns a structured result rather than throwing — the
 * orchestrator decides whether a `validation:semantic-*` failure is
 * terminal or surfaced through telemetry.
 */

import type { ArtifactKind } from '../artifacts/types';

/**
 * Subset of `GenerationFailureCode` covering the codes a semantic
 * validator can emit. Redeclared as a literal union (rather than
 * imported from `failureCodes.ts`) only at the type-system level so
 * each validator file can be type-checked without pulling the runtime
 * codes constant; runtime equality with `GENERATION_FAILURE_CODES` is
 * enforced by a coverage assertion in `semanticValidators.test.ts`.
 *
 * Adding a new semantic failure code requires editing both this union
 * and `failureCodes.ts`.
 */
export type SemanticFailureCode =
  | 'validation:semantic-card-pool-size'
  | 'validation:semantic-card-content-shape'
  | 'validation:semantic-difficulty-distribution'
  | 'validation:semantic-grounding'
  | 'validation:semantic-duplicate-concept'
  | 'validation:semantic-mini-game-playability'
  | 'validation:semantic-trial-question-count'
  | 'validation:semantic-subject-graph';

export type SemanticValidatorResult =
  | { ok: true }
  | {
      ok: false;
      failureCode: SemanticFailureCode;
      message: string;
      /** Optional path into the payload, e.g. 'cards[3].content.options'. */
      path?: string;
    };

/**
 * Cross-cutting context that some validators need but isn't in the
 * artifact payload itself (e.g., the corresponding RunInputSnapshot's
 * `existing_concept_stems` for expansion deduplication, or the lattice
 * artifact's `topicId`s for edges referential integrity).
 *
 * All fields are optional. A validator that REQUIRES a context field
 * but doesn't receive one fails loudly with a clear message rather than
 * silently passing.
 */
export interface SemanticValidatorContext {
  /** For `topic-expansion-cards`: existing concept stems for de-duplication. */
  existingConceptStems?: readonly string[];
  /** For `subject-graph-edges`: every edge endpoint must exist in this set. */
  latticeTopicIds?: readonly string[];
  /** For `crystal-trial`: expected question count (snapshot `question_count`). */
  expectedQuestionCount?: number;
  /** For `topic-study-cards` / `topic-expansion-cards`: pool-size override. */
  minCardPoolSize?: number;
}

export type SemanticValidator<TPayload = unknown> = (
  payload: TPayload,
  context?: SemanticValidatorContext,
) => SemanticValidatorResult;

export type SemanticValidatorByKind = Record<ArtifactKind, SemanticValidator<unknown>>;
