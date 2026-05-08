/**
 * Shared workflow helpers for Phase 3 observability.
 *
 * - `recordTokensRobust` — durable token accounting that surfaces failures
 *   instead of silently catching them (Plan v3 Phase 3 token accounting).
 * - `traceLlmCall` builder — wraps the tracer start/finalize pattern into a
 *   single function used by all four Workflow classes.
 */

import type { Repos } from '../../repositories';
import { createTracer, type LlmCallStart, type LlmCallTrace } from '../../observability/tracer';

/**
 * Record token usage from an OpenRouter response.
 *
 * Phase 3: failures are no longer silently swallowed. They are logged
 * via console.error so they appear in Worker logs / dashboards, and the
 * error reason is included in the trace event. The caller always gets back
 * whether the accounting write succeeded.
 */
export async function recordTokensRobust(
  deviceId: string,
  repos: Repos,
  trace: LlmCallTrace,
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
): Promise<{ ok: boolean; errorReason?: string }> {
  try {
    await repos.usage.recordTokens(
      deviceId,
      new Date().toISOString().slice(0, 10),
      usage,
    );
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      `[token-accounting] failed to record tokens for run=${trace.runId} device=${deviceId}: ${reason}`,
    );
    return { ok: false, errorReason: reason };
  }
}

/**
 * Start + finalize wrapper for LLM call tracing.
 *
 * Returns [trace, finalizeSuccess, finalizeFailure] so callers can record
 * tracing without importing the tracer directly.
 */
export function traceLlmCall(start: LlmCallStart) {
  const tracer = createTracer();
  const trace = tracer.startTrace(start);

  function finalizeSuccess(usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null) {
    tracer.finalizeTrace(trace, true, { usage });
    return trace;
  }

  function finalizeFailure(errorCode: string, errorMessage: string) {
    tracer.finalizeTrace(trace, false, { errorCode, errorMessage });
    return trace;
  }

  return { trace, finalizeSuccess, finalizeFailure };
}
