import type {
  ContentGenerationJob,
  ContentGenerationJobKind,
  ContentGenerationJobStatus,
} from '@/types/contentGeneration';

import type { ContentGenerationState } from './contentGenerationStore';

const ACTIVE_STATUSES: readonly ContentGenerationJobStatus[] = [
  'pending',
  'streaming',
  'parsing',
  'saving',
] as const;

function isActiveStatus(status: ContentGenerationJobStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function isSubjectGraphKind(kind: ContentGenerationJobKind): boolean {
  return kind === 'subject-graph-topics' || kind === 'subject-graph-edges';
}

function phaseFromJob(job: ContentGenerationJob): 'topics' | 'edges' {
  return job.kind === 'subject-graph-edges' ? 'edges' : 'topics';
}

function subjectPipelineLabel(label: string): string {
  const prefixed = /^New subject:\s*(.+)$/.exec(label);
  if (prefixed?.[1]) {
    return prefixed[1].trim();
  }
  return label;
}

function compareJobPriority(a: ContentGenerationJob, b: ContentGenerationJob): number {
  const aFinishedAt = a.finishedAt ?? a.createdAt;
  const bFinishedAt = b.finishedAt ?? b.createdAt;
  return bFinishedAt - aFinishedAt || b.createdAt - a.createdAt;
}

export interface ActiveSubjectGenerationStatus {
  phase: 'topics' | 'edges' | 'failed';
  status: ContentGenerationJobStatus;
  label: string;
  subjectId: string | null;
  pipelineId: string | null;
}

/**
 * Select the most relevant subject-generation status for mentor bubble/HUD affordances.
 * Active subject pipelines take precedence; otherwise the most recent failed/aborted
 * subject pipeline is surfaced as an alert state.
 */
export function activeSubjectGenerationStatus(
  state: Pick<ContentGenerationState, 'jobs' | 'pipelines'>,
): ActiveSubjectGenerationStatus | null {
  const jobs = Object.values(state.jobs).filter((job) => isSubjectGraphKind(job.kind));

  const activeJob = jobs
    .filter((job) => isActiveStatus(job.status))
    .sort(compareJobPriority)[0];

  if (activeJob) {
    const pipelineLabel =
      activeJob.pipelineId !== null ? state.pipelines[activeJob.pipelineId]?.label : null;
    return {
      phase: phaseFromJob(activeJob),
      status: activeJob.status,
      label: subjectPipelineLabel(pipelineLabel ?? activeJob.label),
      subjectId: activeJob.subjectId,
      pipelineId: activeJob.pipelineId,
    };
  }

  const failedJob = jobs
    .filter((job) => job.status === 'failed' || job.status === 'aborted')
    .sort(compareJobPriority)[0];

  if (!failedJob) {
    return null;
  }

  const pipelineLabel =
    failedJob.pipelineId !== null ? state.pipelines[failedJob.pipelineId]?.label : null;
  return {
    phase: 'failed',
    status: failedJob.status,
    label: subjectPipelineLabel(pipelineLabel ?? failedJob.label),
    subjectId: failedJob.subjectId,
    pipelineId: failedJob.pipelineId,
  };
}
