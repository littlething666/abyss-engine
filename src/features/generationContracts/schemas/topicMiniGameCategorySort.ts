import { z } from 'zod';

import { DifficultyTier, KebabId, NonEmptyString } from './_shared';

/**
 * Strict v1 schema for the `topic-mini-game-category-sort` artifact.
 *
 * Card-level `content.gameType` is pinned to the literal that matches
 * the pipeline kind, so a strict json_schema response cannot
 * accidentally cross-emit a different mini-game variant. Per-game
 * playability (min items per category, single-correct-target invariant)
 * is a semantic-validator concern (Phase 0 step 9).
 */
const categorySortContentSchema = z
  .object({
    gameType: z.literal('CATEGORY_SORT'),
    categories: z
      .array(
        z
          .object({
            id: NonEmptyString,
            label: NonEmptyString,
          })
          .strict(),
      )
      .min(2),
    items: z
      .array(
        z
          .object({
            id: NonEmptyString,
            label: NonEmptyString,
            categoryId: NonEmptyString,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const categorySortCardSchema = z
  .object({
    id: NonEmptyString,
    topicId: KebabId,
    type: z.literal('MINI_GAME'),
    content: categorySortContentSchema,
    difficulty: DifficultyTier,
  })
  .strict();

export const topicMiniGameCategorySortArtifactSchema = z
  .object({
    cards: z.array(categorySortCardSchema).min(1),
  })
  .strict();

export type TopicMiniGameCategorySortArtifactPayload = z.infer<
  typeof topicMiniGameCategorySortArtifactSchema
>;

export const topicMiniGameCategorySortSchemaVersion = 1;
