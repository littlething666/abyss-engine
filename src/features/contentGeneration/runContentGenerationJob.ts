import { v4 as uuid } from 'uuid';

import type { ChatCompletionTool, ChatMessage, ChatResponseFormat, IChatCompletionsRepository } from '@/types/llm';
import type { ContentGenerationJob, ContentGenerationJobKind } from '@/types/contentGeneration';
import type { InferenceSurfaceId } from '@/types/llmInference';
import { isContentGenerationAbortReason } from '@/types/contentGenerationAbort';
import {
  resolveIncludeOpenRouterReasoningParam,
  resolveOpenRouterStructuredChatExtrasForJob,
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
  /** Used to apply OpenRouter `json_object` / response-healing only when that surface uses OpenRouter. */
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

  const structured = resolveOpenRouterStructuredChatExtrasForJob(params.llmSurfaceId, {
    jsonSchemaResponseFormat:
      params.responseFormatOverride?.type === 'json_schema'
        ? params.responseFormatOverride
        : undefined,
  });
  const includeOpenRouterReasoning = resolveIncludeOpenRouterReasoningParam(params.llmSurfaceId);
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
    ...(structured?.responseFormat ? { responseFormat: structured.responseFormat } : {}),
    ...(structured?.plugins ? { plugins: structured.plugins } : {}),
    ...(params.tools ? { tools: params.tools } : {}),
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
