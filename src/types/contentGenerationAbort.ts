/**
 * Typed abort reasons for content-generation jobs (serializable JSON objects).
 * Passed to `AbortController.abort(reason)` and read back from `AbortSignal.reason`.
 */

export type ContentGenerationUserAbortSource = 'hud-job' | 'hud-pipeline';

export type ContentGenerationAbortReason =
  | { kind: 'user'; source: ContentGenerationUserAbortSource }
  | { kind: 'navigation'; source: 'beforeunload' }
  | { kind: 'superseded'; source: 'expansion-replaced' };

export function isContentGenerationAbortReason(value: unknown): value is ContentGenerationAbortReason {
  if (!value || typeof value !== 'object') return false;
  const o = value as { kind?: unknown; source?: unknown };
  if (o.kind === 'user') {
    return o.source === 'hud-job' || o.source === 'hud-pipeline';
  }
  if (o.kind === 'navigation') {
    return o.source === 'beforeunload';
  }
  if (o.kind === 'superseded') {
    return o.source === 'expansion-replaced';
  }
  return false;
}

/** Abort reasons that must not produce full pipeline failure markdown logs. */
export function isContentGenerationAbortReasonExcludedFromFailureMarkdown(
  reason: ContentGenerationAbortReason,
): boolean {
  return reason.kind === 'user' || reason.kind === 'navigation' || reason.kind === 'superseded';
}
