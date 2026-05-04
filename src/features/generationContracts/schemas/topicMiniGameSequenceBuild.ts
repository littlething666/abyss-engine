import { z } from 'zod';

import { DifficultyTier, KebabId, NonEmptyString } from './_shared';

/**
 * Strict v1 schema for the `topic-mini-game-sequence-build` artifact.
 *
 * Step 3 validates the structural envelope (steps array shape with
 * positive integer `order`); cross-step uniqueness, contiguous ordering,
 * and minimum-step playability live in the playability semantic
 * validator (Phase 0 step 9).
 */
const sequenceBuildContentSchema = z
  .object({
    gameType: z.literal('SEQUENCE_BUILD'),
    steps: z
      .array(
        z
          .object({
            id: NonEmptyString,
            label: NonEmptyString,
            order: z.number().int().min(1),
          })
          .strict(),
      )
      .min(2),
  })
  .strict();

const sequenceBuildCardSchema = z
  .object({
    id: NonEmptyString,
    topicId: KebabId,
    type: z.literal('MINI_GAME'),
    content: sequenceBuildContentSchema,
    difficulty: DifficultyTier,
  })
  .strict();

export const topicMiniGameSequenceBuildArtifactSchema = z
  .object({
    cards: z.array(sequenceBuildCardSchema).min(1),
  })
  .strict();

export type TopicMiniGameSequenceBuildArtifactPayload = z.infer<
  typeof topicMiniGameSequenceBuildArtifactSchema
>;

export const topicMiniGameSequenceBuildSchemaVersion = 1;
