/** Number of scenario questions per trial */
export const TRIAL_QUESTION_COUNT = 5;

/** Minimum correct answers ratio to pass (80%) */
export const PASS_THRESHOLD = 0.8;

/** Cards that must be reviewed before retry after failure */
export const COOLDOWN_CARDS_REQUIRED = 5;

/** Minimum time before retry after failure (30 minutes) */
export const COOLDOWN_MIN_MS = 30 * 60 * 1000;

/** Maximum card difficulty produced by expansion jobs (L1→diff2, L2→diff3, L3→diff4) */
export const MAX_CARD_DIFFICULTY = 4;

