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

import { failureKeyForJob } from './failureKeys';

/** Max terminal job logs kept in memory and persisted (completed | failed | aborted). */
export const MAX_PERSISTED_LOGS = 15;

function isTerminalStatus(status: ContentGenerationJobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'aborted';
}

function pruneAcknowledgementsForRemovedJobIds(
  ack: Record<string, true>,
  removedJobIds: readonly string[],
): Record<string, true> {
  if (removedJobIds.length === 0) return ack;
  let next = ack;
  for (const id of removedJobIds) {
    const fk = failureKeyForJob(id);
    if (next[fk]) {
      if (next === ack) next = { ...ack };
      delete next[fk];
    }
  }
  return next;
}

function pruneTerminalJobsInRecord(jobs: Record<string, ContentGenerationJob>): {
  jobs: Record<string, ContentGenerationJob>;
  removedJobIds: string[];
} {
  const terminal = Object.values(jobs).filter((j) => isTerminalStatus(j.status));
  if (terminal.length <= MAX_PERSISTED_LOGS) {
    return { jobs, removedJobIds: [] };
  }
  terminal.sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  const toRemove = terminal.slice(0, terminal.length - MAX_PERSISTED_LOGS).map((j) => j.id);
  const next = { ...jobs };
  for (const id of toRemove) {
    delete next[id];
  }
  return { jobs: next, removedJobIds: toRemove };
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

  /** Session-only (not persisted): keys acknowledged via mentor dismiss / retry. */
  sessionAcknowledgedFailureKeys: Record<string, true>;
  /**
   * Retry-routing collapse surfaces (no new job). Keyed by
   * {@link failureKeyForRetryRoutingInstance}.
   */
  sessionRetryRoutingFailures: Record<string, SessionRetryRoutingFailureSurface>;

  acknowledgeFailureKey: (failureKey: string) => void;
  registerSessionRetryRoutingFailure: (surface: SessionRetryRoutingFailureSurface) => void;

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

export interface SessionRetryRoutingFailureSurface {
  failureKey: string;
  failureInstanceId: string;
  originalJobId: string;
  subjectId: string;
  topicId?: string;
  topicLabel?: string;
  jobLabel: string;
  errorMessage: string;
  createdAt: number;
}

export const useContentGenerationStore = create<ContentGenerationState>((set, get) => ({
  jobs: {},
  pipelines: {},
  abortControllers: {},
  pipelineAbortControllers: {},
  sessionAcknowledgedFailureKeys: {},
  sessionRetryRoutingFailures: {},

  acknowledgeFailureKey: (failureKey) =>
    set((s) => {
      if (s.sessionAcknowledgedFailureKeys[failureKey]) return s;
      const sessionAcknowledgedFailureKeys = { ...s.sessionAcknowledgedFailureKeys, [failureKey]: true as const };
      if (!s.sessionRetryRoutingFailures[failureKey]) {
        return { sessionAcknowledgedFailureKeys };
      }
      const sessionRetryRoutingFailures = { ...s.sessionRetryRoutingFailures };
      delete sessionRetryRoutingFailures[failureKey];
      return { sessionAcknowledgedFailureKeys, sessionRetryRoutingFailures };
    }),

  registerSessionRetryRoutingFailure: (surface) =>
    set((s) => ({
      sessionRetryRoutingFailures: { ...s.sessionRetryRoutingFailures, [surface.failureKey]: surface },
    })),

  registerPipeline: (pipeline, abortController) =>
    set((s) => ({
      pipelines: { ...s.pipelines, [pipeline.id]: pipeline },
      pipelineAbortControllers: { ...s.pipelineAbortControllers, [pipeline.id]: abortController },
    })),

  registerJob: (job, ac) =>
    set((s) => {
      let sessionAcknowledgedFailureKeys = s.sessionAcknowledgedFailureKeys;
      if (job.retryOf) {
        const k = failureKeyForJob(job.retryOf);
        if (!sessionAcknowledgedFailureKeys[k]) {
          sessionAcknowledgedFailureKeys = { ...sessionAcknowledgedFailureKeys, [k]: true as const };
        }
      }
      return {
        jobs: { ...s.jobs, [job.id]: job },
        abortControllers: job.pipelineId === null ? { ...s.abortControllers, [job.id]: ac } : s.abortControllers,
        sessionAcknowledgedFailureKeys,
      };
    }),

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

      const pruned = pruneTerminalJobsInRecord(nextJobs);
      nextJobs = pruned.jobs;
      const sessionAcknowledgedFailureKeys = pruneAcknowledgementsForRemovedJobIds(
        s.sessionAcknowledgedFailureKeys,
        pruned.removedJobIds,
      );
      const nextPipelines = pruneOrphanPipelines(nextJobs, s.pipelines);

      return {
        jobs: nextJobs,
        abortControllers,
        pipelineAbortControllers,
        pipelines: nextPipelines,
        sessionAcknowledgedFailureKeys,
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
      const pruned = pruneTerminalJobsInRecord(s.jobs);
      const sessionAcknowledgedFailureKeys = pruneAcknowledgementsForRemovedJobIds(
        s.sessionAcknowledgedFailureKeys,
        pruned.removedJobIds,
      );
      return {
        jobs: pruned.jobs,
        pipelines: pruneOrphanPipelines(pruned.jobs, s.pipelines),
        sessionAcknowledgedFailureKeys,
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
        sessionAcknowledgedFailureKeys: {},
        sessionRetryRoutingFailures: {},
      };
    });
  },
}));
