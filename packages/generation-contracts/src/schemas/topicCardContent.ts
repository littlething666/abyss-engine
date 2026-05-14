import { z } from 'zod';

import {
  DifficultyTier,
  KebabId,
  NonEmptyString,
  StudyCardType,
} from './_shared';

/**
 * Strict v1 schema for a single planned study-card content artifact.
 *
 * `topic-card-content` is the per-card-spec replacement for the legacy broad
 * `topic-study-cards` artifact. The model still emits a temporary `id` because
 * the canonical study-card content shape includes it; backend materialization
 * ignores that value and binds the card to the compiled `cardSpecId` supplied
 * by the prompt snapshot.
 */
const topicCardContentCardSchema = z
  .object({
    id: NonEmptyString,
    topicId: KebabId,
    type: StudyCardType,
    content: z.record(z.string(), z.unknown()),
    difficulty: DifficultyTier,
  })
  .strict();

export const topicCardContentArtifactSchema = z
  .object({
    card: topicCardContentCardSchema,
  })
  .strict();

export type TopicCardContentArtifactPayload = z.infer<
  typeof topicCardContentArtifactSchema
>;

export const topicCardContentSchemaVersion = 1;
