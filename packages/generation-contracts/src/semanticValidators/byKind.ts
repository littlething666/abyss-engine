/**
 * `ArtifactKind` -> semantic-validator registry.
 *
 * Adding an `ArtifactKind` requires:
 *   1. Extending the union in `../artifacts/types.ts`.
 *   2. Adding a strict schema under `../schemas/` and wiring its
 *      strict-parser entry under `../strictParsers/byKind.ts`.
 *   3. Adding a semantic validator file in this directory.
 *   4. Wiring the kind here.
 *
 * The registry signature uses `SemanticValidator<unknown>` because
 * heterogeneous payload types cannot be type-narrowed by the
 * `ArtifactKind` discriminator without a kind-aware mapped type.
 * Per-kind validators retain their precise typed signatures at the
 * point of declaration; the registry casts at the boundary.
 */

import type { ArtifactKind } from '../artifacts/types';
import { validateCrystalTrialArtifact } from './crystalTrial';
import { validateSubjectGraphEdgesArtifact } from './subjectGraphEdges';
import { validateSubjectGraphTopicsArtifact } from './subjectGraphTopics';
import { validateTopicExpansionCardsArtifact } from './topicExpansionCards';
import { validateTopicMiniGameCategorySortArtifact } from './topicMiniGameCategorySort';
import { validateTopicMiniGameMatchPairsArtifact } from './topicMiniGameMatchPairs';
import { validateTopicMiniGameSequenceBuildArtifact } from './topicMiniGameSequenceBuild';
import { validateTopicStudyCardsArtifact } from './topicStudyCards';
import { validateTopicTheoryArtifact } from './topicTheory';
import type {
  SemanticValidator,
  SemanticValidatorByKind,
  SemanticValidatorContext,
  SemanticValidatorResult,
} from './types';

export const SEMANTIC_VALIDATORS_BY_KIND: SemanticValidatorByKind = {
  'subject-graph-topics':
    validateSubjectGraphTopicsArtifact as SemanticValidator<unknown>,
  'subject-graph-edges':
    validateSubjectGraphEdgesArtifact as SemanticValidator<unknown>,
  'topic-theory': validateTopicTheoryArtifact as SemanticValidator<unknown>,
  'topic-study-cards':
    validateTopicStudyCardsArtifact as SemanticValidator<unknown>,
  'topic-mini-game-category-sort':
    validateTopicMiniGameCategorySortArtifact as SemanticValidator<unknown>,
  'topic-mini-game-sequence-build':
    validateTopicMiniGameSequenceBuildArtifact as SemanticValidator<unknown>,
  'topic-mini-game-match-pairs':
    validateTopicMiniGameMatchPairsArtifact as SemanticValidator<unknown>,
  'topic-expansion-cards':
    validateTopicExpansionCardsArtifact as SemanticValidator<unknown>,
  'crystal-trial':
    validateCrystalTrialArtifact as SemanticValidator<unknown>,
};

/**
 * Single-pass semantic validator dispatch by `ArtifactKind`.
 *
 * Pipeline composition roots call this directly after
 * `strictParseArtifact` returns `ok: true`; the parsed payload's runtime
 * shape is guaranteed by the strict Zod schema, so the cast at the
 * registry boundary is safe.
 */
export function semanticValidateArtifact(
  kind: ArtifactKind,
  payload: unknown,
  context?: SemanticValidatorContext,
): SemanticValidatorResult {
  return SEMANTIC_VALIDATORS_BY_KIND[kind](payload, context);
}
