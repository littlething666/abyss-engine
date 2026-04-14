import { v4 as uuid } from 'uuid';

import type { ChatMessage, IChatCompletionsRepository } from '@/types/llm';
import type { ContentGenerationJob, ContentGenerationJobKind } from '@/types/contentGeneration';

import { useContentGenerationStore } from './contentGenerationStore';

export interface ContentGenerationJobParams<TParsed = unknown> {
  kind: ContentGenerationJobKind;
  label: string;
  pipelineId: string | null;
  subjectId: string | null;
  topicId: string | null;

  chat: IChatCompletionsRepository;
  model: string;
  messages: ChatMessage[];
  enableThinking: boolean;

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
}

export async function runContentGenerationJob<TParsed>(
  params: ContentGenerationJobParams<TParsed>,
): Promise<{ ok: boolean; jobId: string; error?: string }> {
  const store = useContentGenerationStore.getState();
  const jobId = uuid();
  const ac = new AbortController();

  if (params.externalSignal) {
    if (params.externalSignal.aborted) {
      ac.abort();
    } else {
      params.externalSignal.addEventListener('abort', () => ac.abort(), { once: true });
    }
  }

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
    metadata: {
      enableThinking: params.enableThinking,
      ...(params.metadata ?? {}),
    },
  };

  store.registerJob(job, ac);

  const updatedJob = (): ContentGenerationJob | undefined =>
    useContentGenerationStore.getState().jobs[jobId];

  try {
    const t0 = Date.now();
    store.updateJobStatus(jobId, 'streaming');
    store.setJobStartedAt(jobId, t0);

    for await (const chunk of params.chat.streamChat({
      model: params.model,
      messages: params.messages,
      enableThinking: params.enableThinking,
      signal: ac.signal,
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
      store.finishJob(jobId, 'failed');
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
      store.finishJob(jobId, 'aborted');
      return { ok: false, jobId, error: 'Aborted' };
    }
    const msg = e instanceof Error ? e.message : String(e);
    store.setJobError(jobId, msg);
    store.finishJob(jobId, 'failed');
    return { ok: false, jobId, error: msg };
  }
}
