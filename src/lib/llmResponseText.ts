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

/** Extract first top-level `{ ... }` span from assistant text (handles optional ``` fences). */
export function extractJsonObjectString(raw: string): string | null {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
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
