import { z } from 'zod';

import {
  DifficultyTier,
  KebabId,
  NonEmptyString,
  StudyCardType,
} from './_shared';

/**
 * Strict v1 schema for the `topic-study-cards` artifact.
 *
 * The card `content` payload differs per `type`. Step 3 validates the
 * envelope (id, topicId, type literal, difficulty, presence of a content
 * object); per-type content shape (cloze blanks, multiple-choice options,
 * etc.) is enforced by the per-card-type semantic validator
 * (Phase 0 step 9).
 *
 * Mini-game cards are explicitly out of scope here — they ship via the
 * dedicated `topic-mini-game-*` artifact kinds.
 */
const studyCardSchema = z
  .object({
    id: NonEmptyString,
    topicId: KebabId,
    type: StudyCardType,
    content: z.record(z.string(), z.unknown()),
    difficulty: DifficultyTier,
  })
  .strict();

export const topicStudyCardsArtifactSchema = z
  .object({
    cards: z.array(studyCardSchema).min(1),
  })
  .strict();

export type TopicStudyCardsArtifactPayload = z.infer<
  typeof topicStudyCardsArtifactSchema
>;

export const topicStudyCardsSchemaVersion = 1;
