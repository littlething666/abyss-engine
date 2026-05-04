/**
 * Helpers for shaping raw assistant / completion text (markdown fences, embedded JSON).
 */

/**
 * Removes a single leading ``` / ```json fence and trailing ``` for UI display.
 * Safe while streaming: hides an incomplete opening fence until a newline completes the opener.
 */
export function stripMarkdownJsonFenceForDisplay(raw: string): string {
  const completeOpen = /^\s*```(?:json)?\s*\r?\n/i;
  let s = raw;
  if (completeOpen.test(s)) {
    s = s.replace(completeOpen, '');
  } else {
    const trimmedStart = s.trimStart();
    if (/^`{1,3}/.test(trimmedStart) && !completeOpen.test(s)) {
      return '';
    }
  }
  s = s.replace(/\r?\n```\s*$/i, '');
  s = s.replace(/```\s*$/i, '');
  return s;
}

/**
 * Extract a top-level JSON array `[...]` or object `{...}` span from assistant text
 * (handles optional ``` fences). Prefers an array when `[` appears before the first `{`.
 *
 * @deprecated **Do not use in durable pipeline code paths.**
 *
 * This is a permissive recovery helper that strips markdown fences and extracts
 * embedded JSON spans from arbitrary assistant prose. The durable generation
 * pipelines (Subject Graph Generation, Topic Content Pipeline, Topic Expansion,
 * Crystal Trial) are required by the Durable Workflow Orchestration plan to call
 * OpenRouter with strict `json_schema` mode and to fail loudly via
 * `parse:json-mode-violation` on anything that is not exact JSON. They use
 * `strictParse` from `@/features/generationContracts` and must never route
 * response text through this helper.
 *
 * Allowed remaining callers:
 * - Legacy in-tab runners and the four legacy permissive parsers
 *   (`parseTopicCardsPayload`, `parseTopicTheoryContentPayload`,
 *   `parseCrystalTrialPayload`, `parseTopicLatticeResponse`) until their
 *   pipeline migrates to the durable runner (Phase 0.5 / Phase 1+).
 * - Non-pipeline UI display surfaces (e.g. study explain) where permissive
 *   parsing is acceptable for cosmetic rendering.
 *
 * Scheduled for removal alongside the legacy in-tab runners in Phase 4.
 * The architectural boundary test in
 * `src/features/generationContracts/strictParsers/legacyParserBoundary.test.ts`
 * enforces that no file under `src/features/generationContracts/**` imports
 * this function.
 */
export function extractJsonString(raw: string): string | null {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  const firstBracket = candidate.indexOf('[');
  const firstBrace = candidate.indexOf('{');

  let start: number;
  let end: number;

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
    end = candidate.lastIndexOf(']');
  } else if (firstBrace !== -1) {
    start = firstBrace;
    end = candidate.lastIndexOf('}');
  } else {
    return null;
  }

  if (end === -1 || end <= start) {
    return null;
  }
  return candidate.slice(start, end + 1);
}

const JSON_PARSE_ERROR_LOG_HEAD = 4000;

/**
 * Logs `JSON.parse` failures for assistant-extracted payloads (browser console).
 * Includes a truncated copy of the string that failed to parse.
 */
export function logJsonParseError(context: string, error: unknown, jsonStr: string): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] JSON.parse failed: ${reason}`, {
    length: jsonStr.length,
    head: jsonStr.slice(0, JSON_PARSE_ERROR_LOG_HEAD),
  });
}
