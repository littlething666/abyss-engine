import type { CrystalTrialScenarioQuestion, TrialQuestionCategory } from '@/types/crystalTrial';
import { TRIAL_QUESTION_COUNT } from '@/features/crystalTrial/crystalTrialConfig';

export interface ParseCrystalTrialResult {
  ok: true;
  questions: CrystalTrialScenarioQuestion[];
}

export interface ParseCrystalTrialError {
  ok: false;
  error: string;
}

const VALID_CATEGORIES = new Set<TrialQuestionCategory>(['interview', 'troubleshooting', 'architecture']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function validateQuestion(
  raw: Record<string, unknown>,
  index: number,
): string | null {
  if (!isNonEmptyString(raw.id)) {
    return `Question ${index}: missing or empty "id"`;
  }
  if (!isNonEmptyString(raw.scenario)) {
    return `Question ${index}: missing or empty "scenario"`;
  }
  if (!isNonEmptyString(raw.question)) {
    return `Question ${index}: missing or empty "question"`;
  }
  if (!isStringArray(raw.options) || raw.options.length < 2) {
    return `Question ${index}: "options" must be an array of at least 2 strings`;
  }
  if (!isNonEmptyString(raw.correctAnswer)) {
    return `Question ${index}: missing or empty "correctAnswer"`;
  }
  if (
    !raw.options.some(
      (opt: string) =>
        opt.trim().toLowerCase() ===
        (raw.correctAnswer as string).trim().toLowerCase(),
    )
  ) {
    return `Question ${index}: "correctAnswer" does not match any option`;
  }
  if (!isNonEmptyString(raw.explanation)) {
    return `Question ${index}: missing or empty "explanation"`;
  }
  if (
    !isStringArray(raw.sourceCardSummaries) ||
    raw.sourceCardSummaries.length === 0
  ) {
    return `Question ${index}: "sourceCardSummaries" must be a non-empty string array`;
  }
  // Category: default to 'interview' if missing or invalid (non-breaking)
  if (!isNonEmptyString(raw.category) || !VALID_CATEGORIES.has(raw.category as TrialQuestionCategory)) {
    raw.category = 'interview';
  }
  return null;
}

/**
 * Parse and validate raw LLM output into CrystalTrialScenarioQuestion[].
 * Expects JSON: { "questions": [...] }
 *
 * @deprecated **Do not use in durable pipeline code paths.**
 *
 * This parser strips markdown code fences in-line, defaults a missing or
 * invalid `category` to `'interview'` instead of failing, and accepts soft
 * whitespace mismatches between `correctAnswer` and `options`. The durable
 * Crystal Trial pipeline must call OpenRouter with strict `json_schema` mode
 * and fail loudly via `parse:json-mode-violation` / `parse:zod-shape` on any
 * envelope deviation. Use the strict pipeline parser instead, via
 * `strictParseArtifact('crystal-trial', raw)` from
 * `@/features/generationContracts`.
 *
 * `TRIAL_QUESTION_COUNT` enforcement is intentionally **not** part of the
 * strict schema (the constant lives in feature code and would cross the
 * contracts → feature boundary the contracts module's AGENTS.md forbids); it
 * moves into the Phase 0 step 9 semantic validators that run after the strict
 * parser in the durable pipeline.
 *
 * Allowed remaining callers: legacy in-tab runners until the Crystal Trial
 * pipeline migrates to the durable runner (Phase 1, Crystal Trial pilot).
 * Scheduled for removal from generation pipeline code paths in Phase 4.
 */
export function parseCrystalTrialPayload(
  raw: string,
): ParseCrystalTrialResult | ParseCrystalTrialError {
  let parsed: unknown;
  try {
    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      ok: false,
      error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).questions)
  ) {
    return {
      ok: false,
      error: 'Expected { "questions": [...] } at top level',
    };
  }

  const rawQuestions = (parsed as { questions: unknown[] }).questions;

  if (rawQuestions.length === 0) {
    return { ok: false, error: 'Questions array is empty' };
  }

  if (rawQuestions.length !== TRIAL_QUESTION_COUNT) {
    return {
      ok: false,
      error: `Expected exactly ${TRIAL_QUESTION_COUNT} questions, got ${rawQuestions.length}`,
    };
  }

  const questions: CrystalTrialScenarioQuestion[] = [];

  for (let i = 0; i < rawQuestions.length; i += 1) {
    const item = rawQuestions[i];
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: `Question ${i}: not an object` };
    }
    const err = validateQuestion(item as Record<string, unknown>, i);
    if (err) {
      return { ok: false, error: err };
    }
    const q = item as Record<string, unknown>;
    questions.push({
      id: q.id as string,
      category: q.category as TrialQuestionCategory,
      scenario: q.scenario as string,
      question: q.question as string,
      options: q.options as string[],
      correctAnswer: q.correctAnswer as string,
      explanation: q.explanation as string,
      sourceCardSummaries: q.sourceCardSummaries as string[],
    });
  }

  return { ok: true, questions };
}
