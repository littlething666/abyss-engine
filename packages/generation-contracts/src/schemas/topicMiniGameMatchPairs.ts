import { z } from 'zod';

import { DifficultyTier, KebabId, NonEmptyString } from './_shared';

/**
 * Strict v1 schema for the `topic-mini-game-match-pairs` artifact.
 *
 * Pair uniqueness, anti-pair cross-talk, and minimum-pair playability
 * are semantic-validator concerns (Phase 0 step 9).
 */
const matchPairsContentSchema = z
  .object({
    gameType: z.literal('MATCH_PAIRS'),
    pairs: z
      .array(
        z
          .object({
            id: NonEmptyString,
            left: NonEmptyString,
            right: NonEmptyString,
          })
          .strict(),
      )
      .min(2),
  })
  .strict();

const matchPairsCardSchema = z
  .object({
    id: NonEmptyString,
    topicId: KebabId,
    type: z.literal('MINI_GAME'),
    content: matchPairsContentSchema,
    difficulty: DifficultyTier,
  })
  .strict();

export const topicMiniGameMatchPairsArtifactSchema = z
  .object({
    cards: z.array(matchPairsCardSchema).min(1),
  })
  .strict();

export type TopicMiniGameMatchPairsArtifactPayload = z.infer<
  typeof topicMiniGameMatchPairsArtifactSchema
>;

export const topicMiniGameMatchPairsSchemaVersion = 1;
