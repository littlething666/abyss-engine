/**
 * Shared workflow helpers for Phase 3 observability.
 *
 * - `traceLlmCall` builder — wraps the tracer start/finalize pattern into a
 *   single function used by all four Workflow classes.
 */

import type { Repos } from '../../repositories';
import type { PipelineKind } from '../../repositories/types';
import { createLogger } from '../../observability/logger';
import { createTracer, type LlmCallStart, type LlmCallTrace } from '../../observability/tracer';

/**
 * Start + finalize wrapper for LLM call tracing.
 *
 * Returns [trace, finalizeSuccess, finalizeFailure] so callers can record
 * tracing without importing the tracer directly.
 */
export async function recordLlmJob(input: {
  repos: Repos;
  runId: string;
  pipelineKind: PipelineKind;
  stage: string;
  inputHash: string;
  model: string;
  status: 'success' | 'failed';
  trace: LlmCallTrace;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<string | null> {
  try {
    const job = await input.repos.runs.insertJob({
      run_id: input.runId,
      kind: input.pipelineKind,
      stage: input.stage,
      status: input.status,
      retry_of: null,
      input_hash: input.inputHash,
      model: input.model,
      metadata_json: {
        traceId: input.trace.traceId,
        generationPolicyHash: input.trace.generationPolicyHash,
        schemaVersion: input.trace.schemaVersion,
        promptTemplateVersion: input.trace.promptVersion,
        providerHealingRequested: input.trace.providerHealingRequested,
        durationMs: input.trace.durationMs,
      },
      started_at: input.trace.startedAt,
      finished_at: input.trace.finishedAt,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
    });
    return job.id;
  } catch (err) {
    createLogger({ runId: input.runId, pipelineKind: input.pipelineKind, stage: input.stage, traceId: input.trace.traceId })
      .error('workflow.job.persist.failure', { errorMessage: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function traceLlmCall(start: LlmCallStart) {
  const tracer = createTracer();
  const trace = tracer.startTrace(start);

  function finalizeSuccess() {
    tracer.finalizeTrace(trace, true);
    return trace;
  }

  function finalizeFailure(errorCode: string, errorMessage: string) {
    tracer.finalizeTrace(trace, false, { errorCode, errorMessage });
    return trace;
  }

  return { trace, finalizeSuccess, finalizeFailure };
}
