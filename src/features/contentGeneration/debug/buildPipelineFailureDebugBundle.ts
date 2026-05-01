import type { ContentGenerationJob } from '@/types/contentGeneration';
import type {
  GeneratedCardQualityReport,
  GeneratedCardValidationFailure,
} from '@/types/contentQuality';
import {
  PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION,
  type PipelineFailureDebugBundle,
  type PipelineFailureShellDebugInput,
} from '@/types/pipelineFailureDebug';

import { useContentGenerationStore } from '../contentGenerationStore';

export interface PipelineFailureDebugContext {
  topicLabel?: string;
  pipelineStage?: string;
  failedStage?: string;
}

function isValidationFailures(value: unknown): value is GeneratedCardValidationFailure[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const row = item as { code?: unknown; message?: unknown; index?: unknown };
      return typeof row.code === 'string' && typeof row.message === 'string' && typeof row.index === 'number';
    })
  );
}

function isQualityReport(value: unknown): value is GeneratedCardQualityReport {
  if (!value || typeof value !== 'object') return false;
  const row = value as {
    emittedCount?: unknown;
    validCount?: unknown;
    invalidCount?: unknown;
    duplicateConceptCount?: unknown;
  };
  return (
    typeof row.emittedCount === 'number' &&
    typeof row.validCount === 'number' &&
    typeof row.invalidCount === 'number' &&
    typeof row.duplicateConceptCount === 'number'
  );
}

function retryChainDepth(job: ContentGenerationJob, jobs: Record<string, ContentGenerationJob>): number {
  let depth = 0;
  let cur: ContentGenerationJob | undefined = job;
  while (cur?.retryOf) {
    depth += 1;
    cur = jobs[cur.retryOf];
    if (depth > 50) break;
  }
  return depth;
}

function parseMessagesJson(raw: string | null): unknown {
  if (raw === null || raw.trim() === '') return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function pickAllowlistedRequestParams(meta: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!meta) return null;
  const keys = [
    'llmSurfaceId',
    'enableReasoning',
    'includeOpenRouterReasoning',
    'enableStreaming',
    'temperature',
    'responseFormat',
    'plugins',
    'tools',
    'retryCount',
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in meta && meta[k] !== undefined) {
      out[k] = meta[k];
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function groundingParts(meta: Record<string, unknown> | null): {
  summary: unknown;
  sources: unknown;
} {
  const g = meta?.grounding;
  if (!g || typeof g !== 'object') {
    return { summary: null, sources: null };
  }
  const obj = g as { sourceCount?: unknown; sources?: unknown; hasAuthoritativePrimarySource?: unknown };
  const summary =
    typeof obj.sourceCount === 'number'
      ? {
          sourceCount: obj.sourceCount,
          hasAuthoritativePrimarySource: typeof obj.hasAuthoritativePrimarySource === 'boolean'
            ? obj.hasAuthoritativePrimarySource
            : undefined,
        }
      : null;
  const sources = Array.isArray(obj.sources) ? obj.sources : null;
  return { summary, sources };
}

export function buildPipelineFailureDebugBundle(
  job: ContentGenerationJob,
  context?: PipelineFailureDebugContext,
): PipelineFailureDebugBundle {
  const meta = (job.metadata ?? null) as Record<string, unknown> | null;
  const jobs = useContentGenerationStore.getState().jobs;
  const { summary: groundingSummary, sources: groundingSources } = groundingParts(meta);

  const validationFailures = meta && isValidationFailures(meta.validationFailures)
    ? meta.validationFailures
    : null;
  const qualityReport = meta && isQualityReport(meta.qualityReport) ? meta.qualityReport : null;

  const finishedAt = job.finishedAt ?? Date.now();
  const startedAt = job.startedAt;
  const durationMs =
    startedAt !== null && finishedAt !== null ? Math.max(0, finishedAt - startedAt) : null;

  const model = meta && typeof meta.model === 'string' ? meta.model : null;

  return {
    schemaVersion: PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION,
    pipelineId: job.pipelineId,
    jobId: job.id,
    jobKind: job.kind,
    status: 'failed',
    subjectId: job.subjectId,
    topicId: job.topicId,
    topicLabel: context?.topicLabel ?? null,
    pipelineStage: context?.pipelineStage ?? null,
    failedStage: context?.failedStage ?? null,
    retryOf: job.retryOf,
    retryChainDepth: retryChainDepth(job, jobs),
    startedAt,
    finishedAt,
    durationMs,
    error: job.error,
    parseError: job.parseError,
    model,
    requestParams: pickAllowlistedRequestParams(meta),
    llmRequestMessages: parseMessagesJson(job.inputMessages),
    llmRawResponse: job.rawOutput,
    llmReasoningText: job.reasoningText,
    providerMetadata: meta?.provider ?? null,
    validationFailures,
    qualityReport,
    groundingSummary,
    groundingSources,
  };
}

export function buildShellPipelineFailureBundle(
  input: PipelineFailureShellDebugInput,
): PipelineFailureDebugBundle {
  const finishedAt = input.finishedAt ?? Date.now();
  const durationMs =
    input.startedAt !== null ? Math.max(0, finishedAt - input.startedAt) : null;

  return {
    schemaVersion: PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION,
    pipelineId: input.pipelineId,
    jobId: null,
    jobKind: null,
    status: 'failed',
    subjectId: input.subjectId,
    topicId: input.topicId,
    topicLabel: input.topicLabel,
    pipelineStage: input.pipelineStage,
    failedStage: input.failedStage,
    retryOf: input.retryOf,
    retryChainDepth: 0,
    startedAt: input.startedAt,
    finishedAt,
    durationMs,
    error: input.error,
    parseError: null,
    model: null,
    requestParams: null,
    llmRequestMessages: null,
    llmRawResponse: '',
    llmReasoningText: null,
    providerMetadata: null,
    validationFailures: null,
    qualityReport: null,
    groundingSummary: null,
    groundingSources: null,
  };
}
