import { z } from 'zod';

import { DifficultyTier, KebabId, NonEmptyString } from './_shared';
import { categorySortContentSchema } from './topicMiniGameCategorySort';
import { matchPairsContentSchema } from './topicMiniGameMatchPairs';
import { sequenceBuildContentSchema } from './topicMiniGameSequenceBuild';

/**
 * Strict v1 schema for a single planned mini-game content artifact.
 *
 * `topic-mini-game-content` is the per-miniGameSpec replacement for legacy
 * broad `topic-mini-game-*` artifacts. The model still emits a temporary `id`
 * because the canonical mini-game card shape includes it; backend
 * materialization ignores that value and binds the card to the compiled
 * `miniGameSpecId` supplied by the prompt snapshot.
 */
const topicMiniGameContentCardSchema = z
  .object({
    id: NonEmptyString,
    topicId: KebabId,
    type: z.literal('MINI_GAME'),
    content: z.discriminatedUnion('gameType', [
      categorySortContentSchema,
      sequenceBuildContentSchema,
      matchPairsContentSchema,
    ]),
    difficulty: DifficultyTier,
  })
  .strict();

export const topicMiniGameContentArtifactSchema = z
  .object({
    card: topicMiniGameContentCardSchema,
  })
  .strict();

export type TopicMiniGameContentArtifactPayload = z.infer<
  typeof topicMiniGameContentArtifactSchema
>;

export const topicMiniGameContentSchemaVersion = 1;
