/**
 * Shared Zod primitives for durable artifact schemas.
 *
 * Anything that smells like feature-specific business logic does NOT
 * belong here: it belongs in `semanticValidators/` (Phase 0 step 9),
 * which runs AFTER strict parsing.
 */

import { z } from 'zod';

/** Non-empty string. */
export const NonEmptyString = z.string().min(1);

/**
 * Lowercase kebab-case identifier. Matches the regex on the legacy
 * topic-lattice schema (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`).
 */
export const KebabId = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, {
    message: 'must be lowercase kebab-case',
  });

/** ISO-8601 datetime string, parsed via `Date.parse`. */
export const IsoTimestamp = z
  .string()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'must be an ISO-8601 datetime string',
  });

/** Difficulty tier 1..4 (integer). */
export const DifficultyTier = z.number().int().min(1).max(4);

/**
 * Allowed study-card type literals at the durable boundary.
 *
 * `MINI_GAME` is intentionally NOT here — mini-game cards ship via the
 * dedicated `topic-mini-game-*` artifact kinds, each with its own
 * strict schema and distinct json_schema response_format.
 */
export const StudyCardType = z.enum(['FLASHCARD', 'CLOZE', 'MULTIPLE_CHOICE']);
export type StudyCardType = z.infer<typeof StudyCardType>;

/**
 * Mini-game `gameType` literals that match the durable artifact kinds:
 *   topic-mini-game-category-sort  → 'CATEGORY_SORT'
 *   topic-mini-game-sequence-build → 'SEQUENCE_BUILD'
 *   topic-mini-game-match-pairs    → 'MATCH_PAIRS'
 */
export const MiniGameType = z.enum([
  'CATEGORY_SORT',
  'SEQUENCE_BUILD',
  'MATCH_PAIRS',
]);
export type MiniGameType = z.infer<typeof MiniGameType>;
