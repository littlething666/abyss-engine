import type { SubjectGraphEdgesArtifactPayload } from '../schemas';
import type { SemanticValidator } from './types';

/**
 * Stage B semantic validator for `subject-graph-edges`.
 *
 * Adds the cross-stage referential integrity check that the strict Zod
 * schema cannot enforce: every edge endpoint must reference a topic
 * that exists in the lattice produced by Stage A.
 *
 * The caller is responsible for passing the Stage A `topicId`s via
 * `SemanticValidatorContext.latticeTopicIds`; if the field is omitted
 * the validator hard-fails because referential integrity cannot be
 * decided silently. Pipeline composition roots load the Stage A
 * artifact (or use the snapshot's `lattice_artifact_content_hash`
 * forward-pointer to fetch it) before invoking this validator.
 *
 * Also adds:
 * - No self-loops (`source === target`).
 * - No duplicate `(source, target)` pair.
 *
 * The AGENTS.md-authorized `correctPrereqEdges` repair pass runs BEFORE
 * the strict parser, so anything reaching this validator is post-repair
 * and any leftover violation is a hard fail rather than a candidate for
 * silent coercion.
 */
export const validateSubjectGraphEdgesArtifact: SemanticValidator<
  SubjectGraphEdgesArtifactPayload
> = (payload, context) => {
  if (context?.latticeTopicIds === undefined) {
    return {
      ok: false,
      failureCode: 'validation:semantic-subject-graph',
      message:
        'subject-graph-edges semantic validation requires context.latticeTopicIds (Stage A topicIds)',
    };
  }
  const lattice = new Set(context.latticeTopicIds);
  const seenPairs = new Set<string>();
  for (let i = 0; i < payload.edges.length; i += 1) {
    const e = payload.edges[i];
    if (e.source === e.target) {
      return {
        ok: false,
        failureCode: 'validation:semantic-subject-graph',
        message: `Self-loop edge at edges[${i}]: ${e.source}`,
        path: `edges[${i}]`,
      };
    }
    if (!lattice.has(e.source)) {
      return {
        ok: false,
        failureCode: 'validation:semantic-subject-graph',
        message: `Unknown source "${e.source}" at edges[${i}] (not in lattice)`,
        path: `edges[${i}].source`,
      };
    }
    if (!lattice.has(e.target)) {
      return {
        ok: false,
        failureCode: 'validation:semantic-subject-graph',
        message: `Unknown target "${e.target}" at edges[${i}] (not in lattice)`,
        path: `edges[${i}].target`,
      };
    }
    const key = `${e.source}\u0000${e.target}`;
    if (seenPairs.has(key)) {
      return {
        ok: false,
        failureCode: 'validation:semantic-subject-graph',
        message: `Duplicate edge at edges[${i}]: ${e.source} \u2192 ${e.target}`,
        path: `edges[${i}]`,
      };
    }
    seenPairs.add(key);
  }
  return { ok: true };
};
