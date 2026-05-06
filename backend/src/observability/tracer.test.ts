/**
 * Observability tracer tests — Phase 3.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTracer, type LlmCallTrace } from './tracer';

describe('tracer', () => {
  let traces: LlmCallTrace[] = [];

  beforeEach(() => {
    traces = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      const msg = args[0];
      if (typeof msg === 'string' && msg.startsWith('[llm-trace]')) {
        const json = msg.slice('[llm-trace] '.length);
        traces.push(JSON.parse(json) as LlmCallTrace);
      }
    });
  });

  it('emits a structured trace on success', () => {
    const tracer = createTracer();
    const trace = tracer.startTrace({
      runId: 'run-001',
      deviceId: 'dev-001',
      pipelineKind: 'crystal-trial',
      stage: 'generate',
      model: 'google/gemini-2.5-flash',
      promptVersion: 2,
      schemaVersion: 1,
      inputHash: 'inp_abc123',
      providerHealingRequested: true,
    });

    tracer.finalizeTrace(trace, true, {
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });

    expect(traces).toHaveLength(1);
    const t = traces[0];
    expect(t.traceId).toBeDefined();
    expect(t.runId).toBe('run-001');
    expect(t.deviceId).toBe('dev-001');
    expect(t.pipelineKind).toBe('crystal-trial');
    expect(t.stage).toBe('generate');
    expect(t.model).toBe('google/gemini-2.5-flash');
    expect(t.promptVersion).toBe(2);
    expect(t.schemaVersion).toBe(1);
    expect(t.inputHash).toBe('inp_abc123');
    expect(t.providerHealingRequested).toBe(true);
    expect(t.success).toBe(true);
    expect(t.errorCode).toBeNull();
    expect(t.errorMessage).toBeNull();
    expect(t.usage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    expect(t.finishedAt).toBeDefined();
    expect(t.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('emits a structured trace on failure', () => {
    const tracer = createTracer();
    const trace = tracer.startTrace({
      runId: 'run-002',
      deviceId: 'dev-001',
      pipelineKind: 'topic-content',
      stage: 'theory',
      model: 'openrouter/google/gemini-2.5-flash',
      inputHash: 'inp_def456',
      providerHealingRequested: false,
    });

    tracer.finalizeTrace(trace, false, {
      errorCode: 'llm:rate-limit',
      errorMessage: 'openrouter 429: rate limited',
    });

    expect(traces).toHaveLength(1);
    const t = traces[0];
    expect(t.success).toBe(false);
    expect(t.errorCode).toBe('llm:rate-limit');
    expect(t.errorMessage).toBe('openrouter 429: rate limited');
    expect(t.usage).toBeNull();
    expect(t.promptVersion).toBe(0); // default
    expect(t.schemaVersion).toBe(0); // default
  });

  it('defaults promptVersion and schemaVersion to 0', () => {
    const tracer = createTracer();
    const trace = tracer.startTrace({
      runId: 'run-003',
      deviceId: 'dev-001',
      pipelineKind: 'subject-graph',
      stage: 'edges',
      model: 'openrouter/google/gemini-2.5-flash',
      inputHash: 'inp_ghi789',
      providerHealingRequested: true,
    });

    tracer.finalizeTrace(trace, true);

    expect(traces).toHaveLength(1);
    expect(traces[0].promptVersion).toBe(0);
    expect(traces[0].schemaVersion).toBe(0);
  });

  it('every trace has a unique traceId', () => {
    const tracer = createTracer();
    const t1 = tracer.startTrace({
      runId: 'run-a', deviceId: 'dev-1', pipelineKind: 'crystal-trial',
      stage: 'gen', model: 'm1', inputHash: 'h1',
      providerHealingRequested: true,
    });
    const t2 = tracer.startTrace({
      runId: 'run-b', deviceId: 'dev-1', pipelineKind: 'topic-expansion',
      stage: 'gen', model: 'm1', inputHash: 'h2',
      providerHealingRequested: true,
    });

    tracer.finalizeTrace(t1, true);
    tracer.finalizeTrace(t2, true);

    expect(traces).toHaveLength(2);
    expect(traces[0].traceId).not.toBe(traces[1].traceId);
  });

  it('includes all required trace fields when finalized as failure without usage', () => {
    const tracer = createTracer();
    const trace = tracer.startTrace({
      runId: 'run-004', deviceId: 'dev-004', pipelineKind: 'subject-graph',
      stage: 'topics', model: 'm', inputHash: 'h',
      providerHealingRequested: true,
    });

    tracer.finalizeTrace(trace, false, {
      errorCode: 'parse:json-mode-violation',
    });

    expect(traces).toHaveLength(1);
    const t = traces[0];
    expect(t.success).toBe(false);
    expect(t.errorCode).toBe('parse:json-mode-violation');
    expect(t.errorMessage).toBeNull();
    expect(t.usage).toBeNull();
    expect(t.finishedAt).toBeDefined();
    expect(t.durationMs).toBeGreaterThanOrEqual(0);
  });
});
