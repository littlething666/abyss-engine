/**
 * Locally-declared semantic constants for durable artifact validators.
 *
 * The contracts module's `AGENTS.md` forbids importing from any other
 * feature module (only `src/types/*` and `zod` / stdlib are allowed) so
 * that this module compiles in the future Worker target. The constants
 * below therefore mirror authoritative values that live in feature code;
 * the JSDoc on each entry cites the upstream source, and the lockstep
 * coverage tests in `semanticValidators.test.ts` import the upstream
 * constants and assert equality with these mirrors so CI fails the
 * moment they drift.
 */

/**
 * Mirrors `TRIAL_QUESTION_COUNT` from
 * `src/features/crystalTrial/crystalTrialConfig.ts`.
 *
 * Production callers should pass the snapshot's `question_count` via
 * `SemanticValidatorContext.expectedQuestionCount`; this constant is the
 * fallback default used when no context is provided (e.g., test cases
 * that don't carry a snapshot).
 */
export const SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT = 5;

/**
 * Mirrors `MAX_CARD_DIFFICULTY` from
 * `src/features/crystalTrial/crystalTrialConfig.ts`. Card difficulty
 * range is 1..MAX inclusive (already enforced as `DifficultyTier` Zod
 * primitive). Provided here so per-tier distribution checks can iterate
 * the canonical range without duplicating the literal.
 */
export const SEMANTIC_MAX_CARD_DIFFICULTY = 4;

/**
 * Mirrors `TOPIC_ICON_NAMES` from
 * `src/features/subjectGeneration/graph/topicIcons/topicIconAllowlist.ts`.
 *
 * Adding a topic icon requires touching the upstream allowlist, the
 * `TopicIconName` literal union in `src/types/core.ts`, and this mirror.
 * The lockstep test fails CI the moment the three diverge.
 */
export const SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST: readonly string[] = [
  'atom',
  'beaker',
  'binary',
  'book-open',
  'brain',
  'calculator',
  'chart-line',
  'cloud',
  'code-xml',
  'compass',
  'cpu',
  'database',
  'dna',
  'flask-conical',
  'function-square',
  'globe',
  'graduation-cap',
  'hammer',
  'handshake',
  'heart-pulse',
  'landmark',
  'languages',
  'leaf',
  'lightbulb',
  'map',
  'microscope',
  'music',
  'network',
  'palette',
  'pen-tool',
  'puzzle',
  'rocket',
  'ruler',
  'scale',
  'server',
  'shield',
  'sigma',
  'telescope',
  'users',
  'wrench',
];

/**
 * Default minimum study-card pool size when the caller does not pass
 * `SemanticValidatorContext.minCardPoolSize`. Mirrors the legacy
 * `parseTopicCardsPayload` convention of at least two cards per
 * difficulty tier across the four-tier range, giving 8 as a baseline.
 * Pipeline composition roots SHOULD pass an explicit override per topic
 * (e.g., a higher floor for a higher target Crystal Level).
 */
export const SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE = 8;
