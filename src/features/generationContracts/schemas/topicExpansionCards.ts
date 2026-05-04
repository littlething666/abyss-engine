import { z } from 'zod';

import {
  DifficultyTier,
  KebabId,
  NonEmptyString,
  StudyCardType,
} from './_shared';

/**
 * Strict v1 schema for the `topic-expansion-cards` artifact.
 *
 * Expansion cards extend an existing topic's pool at higher Crystal
 * Levels. Their boundary shape mirrors `topic-study-cards` for now —
 * if expansion ever produces mini-game cards, those land via dedicated
 * `topic-expansion-mini-game-*` artifact kinds, NOT by widening this
 * schema.
 *
 * Concept-stem de-duplication against the existing pool is a
 * semantic-validator concern (Phase 0 step 9), driven by the
 * `existing_concept_stems` field on the corresponding RunInputSnapshot.
 */
const expansionCardSchema = z
  .object({
    id: NonEmptyString,
    topicId: KebabId,
    type: StudyCardType,
    content: z.record(z.string(), z.unknown()),
    difficulty: DifficultyTier,
  })
  .strict();

export const topicExpansionCardsArtifactSchema = z
  .object({
    cards: z.array(expansionCardSchema).min(1),
  })
  .strict();

export type TopicExpansionCardsArtifactPayload = z.infer<
  typeof topicExpansionCardsArtifactSchema
>;

export const topicExpansionCardsSchemaVersion = 1;
