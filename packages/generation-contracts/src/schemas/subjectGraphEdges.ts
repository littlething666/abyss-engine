import { z } from 'zod';

import { KebabId } from './_shared';

/**
 * Strict v1 schema for the `subject-graph-edges` artifact (Stage B).
 *
 * Cross-stage referential integrity (every `source` / `target` exists in
 * the lattice produced by Stage A) is a semantic-validator concern
 * (Phase 0 step 9). There is no prerequisite-edge repair pass; malformed
 * artifacts fail this schema or the semantic validator explicitly.
 */
export const subjectGraphEdgesArtifactSchema = z
  .object({
    edges: z.array(
      z
        .object({
          source: KebabId,
          target: KebabId,
          minLevel: z.number().int().min(1).optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type SubjectGraphEdgesArtifactPayload = z.infer<
  typeof subjectGraphEdgesArtifactSchema
>;

export const subjectGraphEdgesSchemaVersion = 1;
