import { v4 as uuid } from 'uuid';

import type { ChatCompletionTool, ChatMessage, ChatResponseFormat, IChatCompletionsRepository } from '@/types/llm';
import type { ContentGenerationJob, ContentGenerationJobKind } from '@/types/contentGeneration';
import type { InferenceSurfaceId } from '@/types/llmInference';
import { isPipelineInferenceSurfaceId } from '@/types/llmInference';
import { isContentGenerationAbortReason } from '@/types/contentGenerationAbort';
import {
  resolveIncludeOpenRouterReasoningParam,
  resolveOpenRouterStructuredChatExtrasForJob,
  validatePipelineSurfaceConfig,
} from '@/infrastructure/llmInferenceSurfaceProviders';

import { buildPipelineFailureDebugBundle } from './debug/buildPipelineFailureDebugBundle';
import type { PipelineFailureDebugContext } from './debug/buildPipelineFailureDebugBundle';
import { formatPipelineFailureMarkdown } from './debug/formatPipelineFailureMarkdown';
import { logPipelineFailure } from './debug/logPipelineFailure';
import { countManualRetryDepth } from './countManualRetryDepth';
import { useContentGenerationStore } from './contentGenerationStore';

export type { PipelineFailureDebugContext } from './debug/buildPipelineFailureDebugBundle';

export interface ContentGenerationJobParams<TParsed = unknown> {
  kind: ContentGenerationJobKind;
  label: string;
  pipelineId: string | null;
  subjectId: string | null;
  topicId: string | null;
  /**
   * Surface id used to (a) resolve OpenRouter structured-output extras and
   * reasoning flags and (b) gate pipeline-bound surfaces through
   * {@link validatePipelineSurfaceConfig} BEFORE any LLM call (Phase 0
   * step 6 + step 8 of the Durable Workflow Orchestration plan v3). For the
   * four pipeline-bound surfaces (subjectGenerationTopics,
   * subjectGenerationEdges, topicContent, crystalTrial) the resolver is
   * called with `requireJsonSchema: true` so permissive `json_object`
   * extras are never returned and the job runs in strict JSON Schema mode
   * or fails loudly at the boundary.
   */
  llmSurfaceId: InferenceSurfaceId;

  chat: IChatCompletionsRepository;
  model: string;
  messages: ChatMessage[];
  enableReasoning: boolean;
  enableStreaming?: boolean;
  /** Forwarded to the chat-completions request when set (e.g. low temperature for structured edges). */
  temperature?: number;
  /** Forwarded to OpenRouter-compatible providers when set. */
  tools?: ChatCompletionTool[];

  /**
   * When set with `type: 'json_schema'`, passed to {@link resolveOpenRouterStructuredChatExtrasForJob}
   * so JSON Schema mode is used only when the bound model declares `structured_outputs`.
   *
   * Pipeline-bound surfaces are expected to provide this; without it the
   * resolver returns null (no permissive `json_object` fallback) and the
   * call proceeds in plain text mode while the strict parser still parses
   * raw output. Non-pipeline surfaces continue to accept the legacy
   * permissive shape when this is omitted.
   */
  responseFormatOverride?: ChatResponseFormat;

  parseOutput: (
    raw: string,
    job: ContentGenerationJob,
  ) => Promise<{ ok: true; data: TParsed } | { ok: false; error: string; parseError?: string }>;

  persistOutput: (data: TParsed, job: ContentGenerationJob) => Promise<void>;

  externalSignal?: AbortSignal;

  /** If this job is a retry, the ID of the original job. */
  retryOf?: string;

  /** Extra key–value pairs stored on the job for retry context. */
  metadata?: Record<string, unknown>;

  /** HUD / markdown debug: human topic title and pipeline stage labels. */
  failureDebugContext?: PipelineFailureDebugContext;
}

function finalizeJobFailedWithDebug(
  jobId: string,
  ctx: PipelineFailureDebugContext | undefined,
): void {
  const st = useContentGenerationStore.getState();
  const job = st.jobs[jobId];
  if (!job) return;
  const bundle = buildPipelineFailureDebugBundle(job, ctx);
  const debugMarkdown = formatPipelineFailureMarkdown(bundle);
  st.mergeJobMetadata(jobId, { debugBundle: bundle, debugMarkdown });
  st.finishJob(jobId, 'failed');
  logPipelineFailure(debugMarkdown);
}

export async function runContentGenerationJob<TParsed>(
  params: ContentGenerationJobParams<TParsed>,
): Promise<{ ok: boolean; jobId: string; error?: string }> {
  const store = useContentGenerationStore.getState();
  const jobId = uuid();
  const ac = new AbortController();

  const retryChainDepth = countManualRetryDepth(params.retryOf ?? undefined, store.jobs);

  if (params.externalSignal) {
    if (params.externalSignal.aborted) {
      ac.abort();
    } else {
      params.externalSignal.addEventListener('abort', () => ac.abort(), { once: true });
    }
  }

  // -------------------------------------------------------------------------
  // Phase 0 step 8 (Plan v3): pipeline-bound surfaces never run in permissive
  // `json_object` mode. Two complementary gates:
  //
  //   1. validatePipelineSurfaceConfig (Phase 0 step 6) inspects the binding
  //      + bound OpenRouter config and fails the job BEFORE any LLM call when
  //      the surface is incapable of strict JSON Schema mode (no provider
  //      binding / unknown config / missing `response_format` /
  //      `structured_outputs`). Failure is recorded as a structured
  //      `configValidationFailureCode` on job metadata so HUD / mentor /
  //      telemetry can route it without re-parsing the message. The durable
  //      Worker handler will mirror this gate in Phase 1 via
  //      `generationRunEventHandlers.ts`.
  //
  //   2. resolveOpenRouterStructuredChatExtrasForJob is called with
  //      `requireJsonSchema: true` for pipeline surfaces (Phase 0 step 5
  //      option) so the resolver returns null when no `jsonSchemaResponseFormat`
  //      is supplied or the model lacks `structured_outputs`. With null
  //      extras the chat-completions request body carries NO `responseFormat`
  //      at all — the strict parser still runs against the raw text and
  //      fails loudly. This eliminates the previous `{ type: 'json_object' }`
  //      fallback for pipeline paths.
  //
  // Non-pipeline surfaces (studyQuestionExplain, studyFormulaExplain) keep
  // their existing permissive shape: validation is a no-op and the resolver
  // is called with `requireJsonSchema: false` (default), preserving the
  // legacy `json_object` fallback for those callers until the durable
  // migration completes.
  // -------------------------------------------------------------------------
  const isPipelineSurface = isPipelineInferenceSurfaceId(params.llmSurfaceId);
  const configValidation = isPipelineSurface
    ? validatePipelineSurfaceConfig(params.llmSurfaceId)
    : ({ ok: true } as const);

  const structured = configValidation.ok
    ? resolveOpenRouterStructuredChatExtrasForJob(params.llmSurfaceId, {
        requireJsonSchema: isPipelineSurface,
        allowProviderHealing: true,
        jsonSchemaResponseFormat:
          params.responseFormatOverride?.type === 'json_schema'
            ? params.responseFormatOverride
            : undefined,
      })
    : null;
  const includeOpenRouterReasoning = configValidation.ok
    ? resolveIncludeOpenRouterReasoningParam(params.llmSurfaceId)
    : false;
  const enableStreamingForJob =
    structured?.forceNonStreaming ? false : params.enableStreaming;

  const initialMetadata: Record<string, unknown> = {
    model: params.model,
    enableReasoning: params.enableReasoning,
    llmSurfaceId: params.llmSurfaceId,
    includeOpenRouterReasoning,
    enableStreaming: enableStreamingForJob,
    retryCount: retryChainDepth,
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(structured?.responseFormat?.type === 'json_schema'
      ? {
          structuredOutputMode: 'json_schema' as const,
          structuredOutputSchemaName: structured.responseFormat.json_schema.name,
        }
      : {}),
    // Phase 0 step 7 (Plan v3 Q22): record `providerHealingRequested` whenever
    // the resolver returns OpenRouter structured extras. The flag is the
    // authoritative source of truth from the resolver, mirrors `plugins`
    // presence in the chat-completions request body, and is preserved across
    // telemetry, failure dashboards, and the durable Worker `jobs.metadata_json`
    // (Phase 1). Recording is unconditional on response-format mode because
    // Q22 records the request, not the structured-output shape.
    ...(structured ? { providerHealingRequested: structured.providerHealingRequested } : {}),
    ...(structured?.responseFormat ? { responseFormat: structured.responseFormat } : {}),
    ...(structured?.plugins ? { plugins: structured.plugins } : {}),
    ...(params.tools ? { tools: params.tools } : {}),
    // Phase 0 step 8: surface the structured config-validation failure code
    // on the failed job's metadata so HUD / mentor / telemetry consumers can
    // route on the typed `config:*` identity (lockstep with
    // GENERATION_FAILURE_CODES) without re-parsing the error message.
    ...(!configValidation.ok ? { configValidationFailureCode: configValidation.code } : {}),
    ...(params.metadata ?? {}),
  };

  const job: ContentGenerationJob = {
    id: jobId,
    pipelineId: params.pipelineId,
    kind: params.kind,
    status: 'pending',
    label: params.label,
    subjectId: params.subjectId,
    topicId: params.topicId,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    inputMessages: JSON.stringify(params.messages, null, 2),
    rawOutput: '',
    reasoningText: null,
    error: null,
    parseError: null,
    retryOf: params.retryOf ?? null,
    metadata: initialMetadata,
  };

  store.registerJob(job, ac);

  const updatedJob = (): ContentGenerationJob | undefined =>
    useContentGenerationStore.getState().jobs[jobId];

  const debugCtx = params.failureDebugContext;

  // Phase 0 step 8: bail out before any LLM call when the pipeline-bound
  // surface is misconfigured. The job is registered first so HUD / debug
  // surfaces see the failure as a normal terminal job entry.
  if (!configValidation.ok) {
    store.setJobError(jobId, configValidation.message);
    finalizeJobFailedWithDebug(jobId, debugCtx);
    return { ok: false, jobId, error: configValidation.message };
  }

  try {
    const t0 = Date.now();
    store.updateJobStatus(jobId, 'streaming');
    store.setJobStartedAt(jobId, t0);

    for await (const chunk of params.chat.streamChat({
      model: params.model,
      messages: params.messages,
      includeOpenRouterReasoning,
      enableReasoning: params.enableReasoning,
      enableStreaming: enableStreamingForJob,
      signal: ac.signal,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
      ...(structured
        ? {
            responseFormat: structured.responseFormat,
            ...(structured.plugins ? { plugins: structured.plugins } : {}),
          }
        : {}),
      ...(params.tools ? { tools: params.tools } : {}),
    })) {
      if (ac.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (chunk.type === 'content') {
        store.appendJobOutput(jobId, chunk.text);
      }
      if (chunk.type === 'reasoning') {
        store.appendJobReasoning(jobId, chunk.text);
      }
      if (chunk.type === 'metadata' && chunk.metadata) {
        store.mergeJobMetadata(jobId, { provider: chunk.metadata });
      }
    }

    store.updateJobStatus(jobId, 'parsing');
    const currentJob = updatedJob();
    if (!currentJob) {
      return { ok: false, jobId, error: 'Job missing after stream' };
    }
    const parsed = await params.parseOutput(currentJob.rawOutput, currentJob);

    if (!parsed.ok) {
      if (parsed.parseError) {
        store.setJobParseError(jobId, parsed.parseError);
      }
      if (structured?.responseFormat?.type === 'json_schema') {
        const rf = structured.responseFormat;
        store.mergeJobMetadata(jobId, {
          structuredOutputContractViolation: true,
          structuredOutputMode: 'json_schema',
          structuredOutputSchemaName: rf.json_schema.name,
          providerHealingRequested: structured.providerHealingRequested,
          localParserError: parsed.parseError ?? parsed.error,
        });
      }
      store.setJobError(jobId, parsed.error);
      finalizeJobFailedWithDebug(jobId, debugCtx);
      return { ok: false, jobId, error: parsed.error };
    }

    store.updateJobStatus(jobId, 'saving');
    const jobForPersist = updatedJob();
    if (!jobForPersist) {
      return { ok: false, jobId, error: 'Job missing before persist' };
    }
    await params.persistOutput(parsed.data, jobForPersist);

    store.finishJob(jobId, 'completed');
    return { ok: true, jobId };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      const reason = ac.signal.reason;
      if (isContentGenerationAbortReason(reason)) {
        store.mergeJobMetadata(jobId, { abortReason: reason });
      }
      store.finishJob(jobId, 'aborted');
      return { ok: false, jobId, error: 'Aborted' };
    }
    const msg = e instanceof Error ? e.message : String(e);
    store.setJobError(jobId, msg);
    finalizeJobFailedWithDebug(jobId, debugCtx);
    return { ok: false, jobId, error: msg };
  }
}
