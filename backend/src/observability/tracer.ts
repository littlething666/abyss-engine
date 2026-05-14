/**
 * Structured observability tracer for the durable orchestrator Worker.
 *
 * Phase 3: Worker-only tracing for every LLM call. Captures device_id,
 * run_id, model, generation policy hash, prompt version, schema version,
 * input hash, output hash, provider-healing requested flag, duration, and status.
 *
 * Traces are emitted as structured JSON to the Worker's `console` (which
 * Cloudflare ships to tail workers / logpush / dashboards). A future
 * adapter can ship these to Langfuse or equivalent without changing the
 * call-site shape, because every trace event carries the canonical
 * TSLlCallEvents keys that Phase 3's failure dashboard queries against.
 */

import type { PipelineKind } from '../repositories/types';
import { createLogger } from './logger';

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
  /** Model identifier sent to the configured LLM gateway. */
  model: string;
  /** Backend generation policy hash resolved for this LLM call. */
  generationPolicyHash: string | null;
  /** Prompt template version from the snapshot (0 if unavailable). */
  promptVersion: number;
  /** Schema version from the snapshot (0 if unavailable). */
  schemaVersion: number;
  /** Deterministic input hash of the snapshot that produced the prompt. */
  inputHash: string;
  /** Whether provider response-healing was requested. */
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
  generationPolicyHash?: string;
  promptVersion?: number;
  schemaVersion?: number;
  inputHash: string;
  providerHealingRequested: boolean;
}

/**
 * Tracer factory. Returns an object that starts a trace and then finalizes
 * it with success or failure. Traces are always emitted through the shared
 * logger as structured JSON objects.
 */
export function createTracer() {
  function startTrace(start: LlmCallStart): LlmCallTrace {
    const trace: LlmCallTrace = {
      traceId: crypto.randomUUID(),
      runId: start.runId,
      deviceId: start.deviceId,
      pipelineKind: start.pipelineKind,
      stage: start.stage,
      model: start.model,
      generationPolicyHash: start.generationPolicyHash ?? null,
      promptVersion: start.promptVersion ?? 0,
      schemaVersion: start.schemaVersion ?? 0,
      inputHash: start.inputHash,
      providerHealingRequested: start.providerHealingRequested,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      success: false,
      errorCode: null,
      errorMessage: null,
      durationMs: null,
    };

    createLogger({
      traceId: trace.traceId,
      runId: trace.runId,
      deviceId: trace.deviceId,
      pipelineKind: trace.pipelineKind,
      stage: trace.stage,
    }).info('llm.call.start', {
      model: trace.model,
      generationPolicyHash: trace.generationPolicyHash,
      promptVersion: trace.promptVersion,
      schemaVersion: trace.schemaVersion,
      inputHash: trace.inputHash,
      providerHealingRequested: trace.providerHealingRequested,
      startedAt: trace.startedAt,
    });

    return trace;
  }

  function finalizeTrace(trace: LlmCallTrace, success: boolean, opts?: {
    errorCode?: string;
    errorMessage?: string;
  }) {
    trace.finishedAt = new Date().toISOString();
    trace.durationMs = new Date(trace.finishedAt).getTime() - new Date(trace.startedAt).getTime();
    trace.success = success;
    trace.errorCode = opts?.errorCode ?? null;
    trace.errorMessage = opts?.errorMessage ?? null;

    createLogger({
      traceId: trace.traceId,
      runId: trace.runId,
      deviceId: trace.deviceId,
      pipelineKind: trace.pipelineKind,
      stage: trace.stage,
    }).info('llm.call.end', {
      model: trace.model,
      generationPolicyHash: trace.generationPolicyHash,
      promptVersion: trace.promptVersion,
      schemaVersion: trace.schemaVersion,
      inputHash: trace.inputHash,
      providerHealingRequested: trace.providerHealingRequested,
      startedAt: trace.startedAt,
      finishedAt: trace.finishedAt,
      success: trace.success,
      errorCode: trace.errorCode,
      errorMessage: trace.errorMessage,
      durationMs: trace.durationMs,
    });
  }

  return { startTrace, finalizeTrace };
}
