import { z } from 'zod';

import { KebabId, NonEmptyString } from './_shared';

/**
 * Strict v1 schema for the `subject-graph-topics` artifact (Stage A).
 *
 * The topic-icon allowlist is enforced by the Stage A semantic validator
 * (Phase 0 step 9), not here, so the contracts module stays free of
 * feature-only imports and the same source compiles in the Worker target.
 */
export const subjectGraphTopicsArtifactSchema = z
  .object({
    topics: z
      .array(
        z
          .object({
            topicId: KebabId,
            title: NonEmptyString,
            iconName: NonEmptyString,
            tier: z.number().int().positive(),
            learningObjective: NonEmptyString,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type SubjectGraphTopicsArtifactPayload = z.infer<
  typeof subjectGraphTopicsArtifactSchema
>;

export const subjectGraphTopicsSchemaVersion = 1;
