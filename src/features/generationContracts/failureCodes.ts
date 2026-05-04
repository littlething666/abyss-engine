/**
 * Structured failure codes for the durable generation pipeline.
 *
 * Every terminal failure (parse error, semantic validation error, LLM
 * error, budget cap, cancellation) MUST tag itself with one of these codes
 * so the orchestrator, observability, and retry routing can handle each
 * class consistently across pipelines.
 *
 * Adding a code requires updating the consumers below in lockstep:
 * - Worker terminal-failure emission.
 * - `LocalGenerationRunRepository` synthetic-event emission.
 * - HUD failure-card copy / mentor failure routing.
 * - Telemetry failure dimensions.
 */
export const GENERATION_FAILURE_CODES = [
  // --- Configuration / preconditions ---
  'config:missing-structured-output',
  'config:missing-model-binding',
  'config:invalid',
  'precondition:no-card-pool',
  'precondition:missing-topic',
  'precondition:empty-grounding',

  // --- Validation (post-parse domain checks) ---
  'validation:bad-grounding',
  'validation:semantic-card-pool-size',
  'validation:semantic-difficulty-distribution',
  'validation:semantic-grounding',
  'validation:semantic-duplicate-concept',
  'validation:semantic-mini-game-playability',
  'validation:semantic-trial-question-count',
  'validation:semantic-subject-graph',

  // --- Strict parsing ---
  'parse:zod-shape',
  'parse:json-mode-violation',

  // --- LLM / provider transport ---
  'llm:rate-limit',
  'llm:upstream-5xx',
  'llm:timeout',
  'llm:unknown',

  // --- Budget / cancel ---
  'budget:over-cap',
  'cancel:user',
  'cancel:superseded',
] as const;

export type GenerationFailureCode = (typeof GENERATION_FAILURE_CODES)[number];

const FAILURE_CODE_SET: ReadonlySet<GenerationFailureCode> = new Set(
  GENERATION_FAILURE_CODES,
);

export function isGenerationFailureCode(value: unknown): value is GenerationFailureCode {
  return typeof value === 'string' && FAILURE_CODE_SET.has(value as GenerationFailureCode);
}

/** Top-level category derived from a failure code's `<category>:<detail>` shape. */
export type GenerationFailureCategory =
  | 'config'
  | 'precondition'
  | 'validation'
  | 'parse'
  | 'llm'
  | 'budget'
  | 'cancel';

export function generationFailureCategory(
  code: GenerationFailureCode,
): GenerationFailureCategory {
  const colon = code.indexOf(':');
  // The code constants are exhaustive; the slice is always one of the seven
  // category strings declared above. Cast is local and safe.
  return code.slice(0, colon) as GenerationFailureCategory;
}
