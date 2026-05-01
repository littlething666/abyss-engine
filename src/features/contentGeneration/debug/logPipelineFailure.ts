/**
 * Emits a single copyable markdown block for a failed LLM pipeline or job.
 *
 * Intentionally uses `console.error` with the `[abyss:pipeline-failed]` prefix
 * so PostHog `capture_exceptions.capture_console_errors` may forward the full
 * diagnostic markdown when exception autocapture is enabled. Product
 * assumption: prompts/responses in these failures are non-sensitive; revisit
 * before introducing private user-authored prompt content.
 */
export function logPipelineFailure(debugMarkdown: string): void {
  console.error(`[abyss:pipeline-failed]\n${debugMarkdown}`);
}
