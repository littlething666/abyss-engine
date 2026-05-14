import { z } from 'zod';

import { NonEmptyString } from './_shared';

const SyllabusKeysSchema = z
  .object({
    '1': z.array(NonEmptyString).min(1),
    '2': z.array(NonEmptyString).min(1),
    '3': z.array(NonEmptyString).min(1),
    '4': z.array(NonEmptyString).min(1),
  })
  .strict();

/**
 * Strict v1 schema for the `topic-theory` artifact.
 *
 * `keyTakeaways` lower bound (≥4) matches the legacy parser's contract.
 * Grounding-source extraction is NOT in scope here — provider annotations
 * are extracted by the post-parse semantic validator (Phase 0 step 9),
 * which receives the parsed payload + provider metadata together.
 */
export const topicTheoryArtifactSchema = z
  .object({
    coreConcept: NonEmptyString,
    theory: NonEmptyString,
    keyTakeaways: z.array(NonEmptyString).min(4),
    coreQuestionsByDifficulty: SyllabusKeysSchema,
  })
  .strict();

export type TopicTheoryArtifactPayload = z.infer<
  typeof topicTheoryArtifactSchema
>;

export const topicTheorySchemaVersion = 1;
