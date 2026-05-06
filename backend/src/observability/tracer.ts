/**
 * Structured observability tracer for the durable orchestrator Worker.
 *
 * Phase 3: Worker-only tracing for every LLM call. Captures device_id,
 * run_id, model, prompt version, schema version, input hash, output hash,
 * provider-healing requested flag, token usage, duration, and status.
 *
 * Traces are emitted as structured JSON to the Worker's `console` (which
 * Cloudflare ships to tail workers / logpush / dashboards). A future
 * adapter can ship these to Langfuse or equivalent without changing the
 * call-site shape, because every trace event carries the canonical
 * TSLlCallEvents keys that Phase 3's failure dashboard queries against.
 */

import type { PipelineKind } from '../repositories/types';

// ---------------------------------------------------------------------------
// Trace event types
// ---------------------------------------------------------------------------
export interface LlmCallTrace {
  /** Unique trace identifier (minted per-LLM-call). */
  traceId: string;
  /** The run that initiated this call. */
  runId: string;
  /** The device that owns the run. */
  deviceId: string;
  /** Pipeline kind (topic-content, topic-expansion, subject-graph, crystal-trial). */
  pipelineKind: PipelineKind;
  /** Stage identifier within the pipeline (e.g. 'generate', 'theory', 'mini-games:CATEGORY_SORT'). */
  stage: string;
  /** Model identifier sent to OpenRouter. */
  model: string;
  /** Prompt template version from the snapshot (0 if unavailable). */
  promptVersion: number;
  /** Schema version from the snapshot (0 if unavailable). */
  schemaVersion: number;
  /** Deterministic input hash of the snapshot that produced the prompt. */
  inputHash: string;
  /** Whether the OpenRouter response-healing plugin was requested. */
  providerHealingRequested: boolean;
  /** ISO-8601 start timestamp. */
  startedAt: string;
  /** ISO-8601 end timestamp (set on completion or failure). */
  finishedAt: string | null;
  /** Whether the underlying fetch + parse succeeded. */
  success: boolean;
  /** Structured failure code (null if success). */
  errorCode: string | null;
  /** Human-readable error message (null if success). */
  errorMessage: string | null;
  /** Token usage from OpenRouter response (null if fetch never reached provider). */
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  /** Duration in milliseconds (computed after finishedAt is set). */
  durationMs: number | null;
}

/** Context for starting an LLM call trace. */
export interface LlmCallStart {
  runId: string;
  deviceId: string;
  pipelineKind: PipelineKind;
  stage: string;
  model: string;
  promptVersion?: number;
  schemaVersion?: number;
  inputHash: string;
  providerHealingRequested: boolean;
}

/**
 * Tracer factory. Returns an object that starts a trace and then finalizes
 * it with success or failure. Traces are always emitted to console.log as
 * structured JSON.
 */
export function createTracer() {
  function startTrace(start: LlmCallStart): LlmCallTrace {
    return {
      traceId: crypto.randomUUID(),
      runId: start.runId,
      deviceId: start.deviceId,
      pipelineKind: start.pipelineKind,
      stage: start.stage,
      model: start.model,
      promptVersion: start.promptVersion ?? 0,
      schemaVersion: start.schemaVersion ?? 0,
      inputHash: start.inputHash,
      providerHealingRequested: start.providerHealingRequested,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      success: false,
      errorCode: null,
      errorMessage: null,
      usage: null,
      durationMs: null,
    };
  }

  function finalizeTrace(trace: LlmCallTrace, success: boolean, opts?: {
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
    errorCode?: string;
    errorMessage?: string;
  }) {
    trace.finishedAt = new Date().toISOString();
    trace.durationMs = new Date(trace.finishedAt).getTime() - new Date(trace.startedAt).getTime();
    trace.success = success;
    trace.errorCode = opts?.errorCode ?? null;
    trace.errorMessage = opts?.errorMessage ?? null;

    if (opts?.usage) {
      trace.usage = {
        promptTokens: opts.usage.prompt_tokens,
        completionTokens: opts.usage.completion_tokens,
        totalTokens: opts.usage.total_tokens,
      };
    }

    // Emit as structured JSON to stdout (Cloudflare logpush / tail workflow target).
    // Prefix with [llm-trace] for easy filtering in log dashboards.
    console.log(`[llm-trace] ${JSON.stringify(trace)}`);
  }

  return { startTrace, finalizeTrace };
}
