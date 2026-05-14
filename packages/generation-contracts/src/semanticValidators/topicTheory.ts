import type { TopicTheoryArtifactPayload } from '../schemas';
import type { SemanticValidator } from './types';

/**
 * Semantic validator for `topic-theory`.
 *
 * The strict Zod schema already enforces the structural envelope
 * (`keyTakeaways.length >= 4`, four populated `coreQuestionsByDifficulty`
 * buckets). This validator adds the domain rules that envelope cannot
 * encode:
 * 1. No duplicate `keyTakeaways` (case-insensitive trim) — drift
 *    sometimes emits the same takeaway twice.
 * 2. No duplicate syllabus question WITHIN a difficulty bucket.
 *
 * Provider-grounding annotation extraction runs in the Worker against
 * provider metadata, not on the parsed artifact, and lands at the
 * `validation:bad-grounding` code in the orchestrator. That check is
 * intentionally NOT here — this validator only sees the parsed payload.
 */
export const validateTopicTheoryArtifact: SemanticValidator<
  TopicTheoryArtifactPayload
> = (payload) => {
  const seenTakeaways = new Set<string>();
  for (let i = 0; i < payload.keyTakeaways.length; i += 1) {
    const t = payload.keyTakeaways[i];
    const key = t.trim().toLowerCase();
    if (seenTakeaways.has(key)) {
      return {
        ok: false,
        failureCode: 'validation:semantic-duplicate-concept',
        message: `Duplicate keyTakeaway at index ${i}: ${t}`,
        path: `keyTakeaways[${i}]`,
      };
    }
    seenTakeaways.add(key);
  }
  for (const tier of ['1', '2', '3', '4'] as const) {
    const seenQuestions = new Set<string>();
    const bucket = payload.coreQuestionsByDifficulty[tier];
    for (let i = 0; i < bucket.length; i += 1) {
      const q = bucket[i];
      const key = q.trim().toLowerCase();
      if (seenQuestions.has(key)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-duplicate-concept',
          message: `Duplicate syllabus question at coreQuestionsByDifficulty[${tier}][${i}]`,
          path: `coreQuestionsByDifficulty.${tier}[${i}]`,
        };
      }
      seenQuestions.add(key);
    }
  }
  return { ok: true };
};
