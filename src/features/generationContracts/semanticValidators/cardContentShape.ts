/**
 * Per-card-content shape validation for `topic-study-cards` and
 * `topic-expansion-cards`.
 *
 * The strict Zod schema for these artifacts intentionally accepts
 * `content: Record<string, unknown>` so the artifact-level structural
 * envelope stays minimal and per-type variation lives here. Splitting
 * the two layers preserves the contracts module `AGENTS.md` boundary
 * between strict parsing (envelope) and semantic validation (domain
 * rules) and lets the strict parser fail with a single uniform
 * `parse:zod-shape` code rather than drift across content shapes.
 */

import { z } from 'zod';

const flashcardContentSchema = z
  .object({
    front: z.string().min(1),
    back: z.string().min(1),
  })
  .strict();

const clozeContentSchema = z
  .object({
    text: z.string().min(1),
    blanks: z.array(z.string().min(1)).min(1),
  })
  .strict();

const multipleChoiceContentSchema = z
  .object({
    question: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    correctAnswer: z.string().min(1),
  })
  .strict()
  .refine(
    (c) =>
      c.options.some(
        (o) =>
          o.trim().toLowerCase() === c.correctAnswer.trim().toLowerCase(),
      ),
    {
      message: 'correctAnswer must match one of options (case-insensitive)',
      path: ['correctAnswer'],
    },
  );

export type StudyCardLikeType = 'FLASHCARD' | 'CLOZE' | 'MULTIPLE_CHOICE';

/**
 * Validates a single card's `content` payload against its `type`
 * literal. Returns a one-line human-readable error string on failure or
 * `null` on success.
 *
 * The returned string is interpolated into the surrounding validator's
 * `message` field next to the artifact path so an investigator can see
 * exactly which content key is malformed without grovelling through Zod
 * issue arrays.
 */
export function validateCardContentByType(
  type: StudyCardLikeType,
  content: unknown,
): string | null {
  const schema =
    type === 'FLASHCARD'
      ? flashcardContentSchema
      : type === 'CLOZE'
        ? clozeContentSchema
        : multipleChoiceContentSchema;
  const result = schema.safeParse(content);
  if (result.success) return null;
  const issue = result.error.issues[0];
  const issuePath =
    issue?.path?.length ? issue.path.map(String).join('.') : 'content';
  return `${issuePath}: ${issue?.message ?? 'invalid'}`;
}

/**
 * Extracts the principal text of a card for concept-stem de-duplication.
 * Returns `null` when the relevant field is missing or non-string (the
 * surrounding content-shape validator will already have failed in that
 * case, so concept-stem dedup is a no-op for invalid cards).
 */
export function extractConceptStem(card: {
  type: StudyCardLikeType;
  content: Record<string, unknown>;
}): string | null {
  if (card.type === 'FLASHCARD') {
    const front = card.content.front;
    return typeof front === 'string' ? front : null;
  }
  if (card.type === 'CLOZE') {
    const text = card.content.text;
    return typeof text === 'string' ? text : null;
  }
  const question = card.content.question;
  return typeof question === 'string' ? question : null;
}

/** Stable normalization for concept-stem de-duplication keys. */
export function normalizeConceptStem(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}
