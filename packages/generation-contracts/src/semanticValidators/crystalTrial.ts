import type { CrystalTrialArtifactPayload } from '../schemas';
import { SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT } from './_constants';
import type { SemanticValidator } from './types';

/**
 * Semantic validator for `crystal-trial`.
 *
 * The strict Zod schema already enforces the structural envelope
 * (>=1 question, each question has >=2 options, `correctAnswer`
 * matches one of `options` case-insensitively, `sourceCardSummaries`
 * non-empty). This validator adds:
 * 1. Total question count equals the snapshot's `question_count` (passed
 *    via `context.expectedQuestionCount`); the `TRIAL_QUESTION_COUNT`
 *    fallback default applies only when no context is supplied (e.g.,
 *    test fixtures).
 * 2. Question `id` values are unique within the artifact.
 * 3. Per-question option uniqueness (case-insensitive trim) — duplicates
 *    make the multiple-choice prompt undecidable for the player.
 */
export const validateCrystalTrialArtifact: SemanticValidator<
  CrystalTrialArtifactPayload
> = (payload, context) => {
  const expected =
    context?.expectedQuestionCount ?? SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT;
  if (payload.questions.length !== expected) {
    return {
      ok: false,
      failureCode: 'validation:semantic-trial-question-count',
      message: `Expected ${expected} trial questions, got ${payload.questions.length}`,
      path: 'questions',
    };
  }
  const seenIds = new Set<string>();
  for (let i = 0; i < payload.questions.length; i += 1) {
    const q = payload.questions[i];
    if (seenIds.has(q.id)) {
      return {
        ok: false,
        failureCode: 'validation:semantic-duplicate-concept',
        message: `Duplicate question id at questions[${i}]: ${q.id}`,
        path: `questions[${i}].id`,
      };
    }
    seenIds.add(q.id);
    const seenOptions = new Set<string>();
    for (let j = 0; j < q.options.length; j += 1) {
      const norm = q.options[j].trim().toLowerCase();
      if (seenOptions.has(norm)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-duplicate-concept',
          message: `Duplicate option at questions[${i}].options[${j}]: ${q.options[j]}`,
          path: `questions[${i}].options[${j}]`,
        };
      }
      seenOptions.add(norm);
    }
  }
  return { ok: true };
};
