import { create } from 'zustand';

import {
  clearPersistedLogs,
  persistPipeline,
  persistTerminalJob,
} from '@/infrastructure/repositories/contentGenerationLogRepository';
import type {
  ContentGenerationJob,
  ContentGenerationJobStatus,
  ContentGenerationPipeline,
} from '@/types/contentGeneration';

/** Max terminal job logs kept in memory and persisted (completed | failed | aborted). */
export const MAX_PERSISTED_LOGS = 15;

function isTerminalStatus(status: ContentGenerationJobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'aborted';
}

function pruneTerminalJobsInRecord(jobs: Record<string, ContentGenerationJob>): Record<string, ContentGenerationJob> {
  const terminal = Object.values(jobs).filter((j) => isTerminalStatus(j.status));
  if (terminal.length <= MAX_PERSISTED_LOGS) {
    return jobs;
  }
  terminal.sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  const toRemove = new Set(
    terminal.slice(0, terminal.length - MAX_PERSISTED_LOGS).map((j) => j.id),
  );
  const next = { ...jobs };
  for (const id of toRemove) {
    delete next[id];
  }
  return next;
}

function pruneOrphanPipelines(
  jobs: Record<string, ContentGenerationJob>,
  pipelines: Record<string, ContentGenerationPipeline>,
): Record<string, ContentGenerationPipeline> {
  const next = { ...pipelines };
  for (const pid of Object.keys(next)) {
    const stillUsed = Object.values(jobs).some((j) => j.pipelineId === pid);
    if (!stillUsed) {
      delete next[pid];
    }
  }
  return next;
}

export interface ContentGenerationState {
  jobs: Record<string, ContentGenerationJob>;
  pipelines: Record<string, ContentGenerationPipeline>;
  abortControllers: Record<string, AbortController>;
  pipelineAbortControllers: Record<string, AbortController>;

  registerPipeline: (pipeline: ContentGenerationPipeline, abortController: AbortController) => void;
  registerJob: (job: ContentGenerationJob, abortController: AbortController) => void;
  updateJobStatus: (jobId: string, status: ContentGenerationJobStatus) => void;
  setJobStartedAt: (jobId: string, at: number) => void;
  appendJobOutput: (jobId: string, text: string) => void;
  appendJobReasoning: (jobId: string, text: string) => void;
  setJobInputMessages: (jobId: string, input: string) => void;
  setJobError: (jobId: string, error: string) => void;
  setJobParseError: (jobId: string, parseError: string) => void;
  mergeJobMetadata: (jobId: string, patch: Record<string, unknown>) => void;
  finishJob: (jobId: string, status: 'completed' | 'failed' | 'aborted') => void;
  abortJob: (jobId: string, reason?: unknown) => void;
  abortPipeline: (pipelineId: string, reason?: unknown) => void;

  pruneCompletedJobs: () => void;
  hydrateFromPersisted: (jobs: ContentGenerationJob[], pipelines: ContentGenerationPipeline[]) => void;
  clearCompletedJobs: () => void;
}

export const useContentGenerationStore = create<ContentGenerationState>((set, get) => ({
  jobs: {},
  pipelines: {},
  abortControllers: {},
  pipelineAbortControllers: {},

  registerPipeline: (pipeline, abortController) =>
    set((s) => ({
      pipelines: { ...s.pipelines, [pipeline.id]: pipeline },
      pipelineAbortControllers: { ...s.pipelineAbortControllers, [pipeline.id]: abortController },
    })),

  registerJob: (job, ac) =>
    set((s) => ({
      jobs: { ...s.jobs, [job.id]: job },
      abortControllers: job.pipelineId === null ? { ...s.abortControllers, [job.id]: ac } : s.abortControllers,
    })),

  updateJobStatus: (jobId, status) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j) return s;
      return { jobs: { ...s.jobs, [jobId]: { ...j, status } } };
    }),

  setJobStartedAt: (jobId, at) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j) return s;
      return { jobs: { ...s.jobs, [jobId]: { ...j, startedAt: at } } };
    }),

  appendJobOutput: (jobId, text) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j) return s;
      return { jobs: { ...s.jobs, [jobId]: { ...j, rawOutput: j.rawOutput + text } } };
    }),

  appendJobReasoning: (jobId, text) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j) return s;
      const prev = j.reasoningText ?? '';
      return { jobs: { ...s.jobs, [jobId]: { ...j, reasoningText: prev + text } } };
    }),

  setJobInputMessages: (jobId, input) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j) return s;
      return { jobs: { ...s.jobs, [jobId]: { ...j, inputMessages: input } } };
    }),

  setJobError: (jobId, error) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j) return s;
      return { jobs: { ...s.jobs, [jobId]: { ...j, error } } };
    }),

  setJobParseError: (jobId, parseError) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j) return s;
      return { jobs: { ...s.jobs, [jobId]: { ...j, parseError } } };
    }),

  mergeJobMetadata: (jobId, patch) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j) return s;
      const meta = { ...(j.metadata ?? {}), ...patch };
      return { jobs: { ...s.jobs, [jobId]: { ...j, metadata: meta } } };
    }),

  finishJob: (jobId, terminalStatus) => {
    const job = get().jobs[jobId];
    if (!job) return;

    const finishedAt = Date.now();
    const updatedJob: ContentGenerationJob = { ...job, status: terminalStatus, finishedAt };

    void (async () => {
      try {
        await persistTerminalJob(updatedJob);
        if (updatedJob.pipelineId) {
          const p = get().pipelines[updatedJob.pipelineId];
          if (p) {
            await persistPipeline(p);
          }
        }
      } catch (e) {
        console.error('[contentGeneration] persistTerminalJob failed', e);
      }
    })();

    set((s) => {
      let nextJobs = { ...s.jobs, [jobId]: updatedJob };
      let abortControllers = s.abortControllers;
      let pipelineAbortControllers = s.pipelineAbortControllers;

      if (job.pipelineId === null && abortControllers[jobId]) {
        abortControllers = { ...abortControllers };
        delete abortControllers[jobId];
      }

      if (job.pipelineId) {
        const siblings = Object.values(nextJobs).filter((j) => j.pipelineId === job.pipelineId);
        if (siblings.every((j) => isTerminalStatus(j.status))) {
          pipelineAbortControllers = { ...pipelineAbortControllers };
          delete pipelineAbortControllers[job.pipelineId];
        }
      }

      nextJobs = pruneTerminalJobsInRecord(nextJobs);
      const nextPipelines = pruneOrphanPipelines(nextJobs, s.pipelines);

      return {
        jobs: nextJobs,
        abortControllers,
        pipelineAbortControllers,
        pipelines: nextPipelines,
      };
    });
  },

  abortJob: (jobId, reason) => {
    get().abortControllers[jobId]?.abort(reason);
  },

  abortPipeline: (pipelineId, reason) => {
    get().pipelineAbortControllers[pipelineId]?.abort(reason);
  },

  pruneCompletedJobs: () =>
    set((s) => {
      const nextJobs = pruneTerminalJobsInRecord(s.jobs);
      return {
        jobs: nextJobs,
        pipelines: pruneOrphanPipelines(nextJobs, s.pipelines),
      };
    }),

  hydrateFromPersisted: (jobs, pipelines) =>
    set((s) => ({
      jobs: { ...s.jobs, ...Object.fromEntries(jobs.map((j) => [j.id, j])) },
      pipelines: { ...s.pipelines, ...Object.fromEntries(pipelines.map((p) => [p.id, p])) },
    })),

  clearCompletedJobs: () => {
    void clearPersistedLogs().catch((e) => {
      console.error('[contentGeneration] clearPersistedLogs failed', e);
    });
    set((s) => {
      const nextJobs = { ...s.jobs };
      for (const [id, j] of Object.entries(nextJobs)) {
        if (isTerminalStatus(j.status)) {
          delete nextJobs[id];
        }
      }
      const nextPipelines = pruneOrphanPipelines(nextJobs, s.pipelines);
      const nextAbort = { ...s.abortControllers };
      for (const id of Object.keys(nextAbort)) {
        if (!nextJobs[id]) {
          delete nextAbort[id];
        }
      }
      return {
        jobs: nextJobs,
        pipelines: nextPipelines,
        abortControllers: nextAbort,
      };
    });
  },
}));
