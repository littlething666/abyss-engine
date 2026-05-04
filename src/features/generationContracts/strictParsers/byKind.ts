/**
 * `ArtifactKind` → strict-parser registry.
 *
 * Adding an `ArtifactKind` requires:
 *   1. Extending the union in `../artifacts/types.ts`.
 *   2. Adding a strict schema under `../schemas/`.
 *   3. Wiring the kind here.
 *
 * This file is the only consumer of every kind's schema; the strict-parser
 * module's `index.ts` re-exports `strictParseArtifact` so callers never
 * import schemas directly when all they need is parse-by-kind.
 */

import type { z } from 'zod';

import type { ArtifactKind } from '../artifacts/types';
import {
  crystalTrialArtifactSchema,
  subjectGraphEdgesArtifactSchema,
  subjectGraphTopicsArtifactSchema,
  topicExpansionCardsArtifactSchema,
  topicMiniGameCategorySortArtifactSchema,
  topicMiniGameMatchPairsArtifactSchema,
  topicMiniGameSequenceBuildArtifactSchema,
  topicStudyCardsArtifactSchema,
  topicTheoryArtifactSchema,
} from '../schemas';
import { strictParse, type StrictParseResult } from './strictParse';

export const ARTIFACT_KIND_TO_SCHEMA: Record<ArtifactKind, z.ZodType<unknown>> = {
  'subject-graph-topics': subjectGraphTopicsArtifactSchema,
  'subject-graph-edges': subjectGraphEdgesArtifactSchema,
  'topic-theory': topicTheoryArtifactSchema,
  'topic-study-cards': topicStudyCardsArtifactSchema,
  'topic-mini-game-category-sort': topicMiniGameCategorySortArtifactSchema,
  'topic-mini-game-sequence-build': topicMiniGameSequenceBuildArtifactSchema,
  'topic-mini-game-match-pairs': topicMiniGameMatchPairsArtifactSchema,
  'topic-expansion-cards': topicExpansionCardsArtifactSchema,
  'crystal-trial': crystalTrialArtifactSchema,
};

export function strictParseArtifact(
  kind: ArtifactKind,
  raw: string,
): StrictParseResult<unknown> {
  return strictParse(raw, ARTIFACT_KIND_TO_SCHEMA[kind]);
}
