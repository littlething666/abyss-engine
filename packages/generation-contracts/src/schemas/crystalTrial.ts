import { z } from 'zod';

import { NonEmptyString } from './_shared';

const trialQuestionCategory = z.enum([
  'interview',
  'troubleshooting',
  'architecture',
]);

const crystalTrialQuestionSchema = z
  .object({
    id: NonEmptyString,
    category: trialQuestionCategory,
    scenario: NonEmptyString,
    question: NonEmptyString,
    options: z.array(NonEmptyString).min(2),
    correctAnswer: NonEmptyString,
    explanation: NonEmptyString,
    sourceCardSummaries: z.array(NonEmptyString).min(1),
  })
  .strict()
  .refine(
    (q) =>
      q.options.some(
        (opt) =>
          opt.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase(),
      ),
    {
      message: 'correctAnswer must match one of options (case-insensitive)',
      path: ['correctAnswer'],
    },
  );

/**
 * Strict v1 schema for the `crystal-trial` artifact.
 *
 * Total question count (`TRIAL_QUESTION_COUNT` from
 * `crystalTrialConfig.ts`) is enforced by the Crystal Trial semantic
 * validator (Phase 0 step 9), since pulling that constant here would
 * cross the contracts → feature boundary the module's AGENTS.md
 * forbids.
 */
export const crystalTrialArtifactSchema = z
  .object({
    questions: z.array(crystalTrialQuestionSchema).min(1),
  })
  .strict();

export type CrystalTrialArtifactPayload = z.infer<
  typeof crystalTrialArtifactSchema
>;

export const crystalTrialSchemaVersion = 1;
