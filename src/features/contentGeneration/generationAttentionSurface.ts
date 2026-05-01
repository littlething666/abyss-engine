import type {
  ContentGenerationJob,
  ContentGenerationJobKind,
  ContentGenerationJobStatus,
  ContentGenerationPipeline,
} from '@/types/contentGeneration';

import type { ContentGenerationState, SessionRetryRoutingFailureSurface } from './contentGenerationStore';
import { failureKeyForJob } from './failureKeys';

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

function subjectGraphPhaseFromJob(job: ContentGenerationJob): 'topics' | 'edges' {
  return job.kind === 'subject-graph-edges' ? 'edges' : 'topics';
}

export function subjectPipelineLabel(label: string): string {
  const prefixed = /^New subject:\s*(.+)$/.exec(label);
  if (prefixed?.[1]) {
    return prefixed[1].trim();
  }
  return label;
}

function compareJobRecency(a: ContentGenerationJob, b: ContentGenerationJob): number {
  const aFinishedAt = a.finishedAt ?? a.createdAt;
  const bFinishedAt = b.finishedAt ?? b.createdAt;
  return bFinishedAt - aFinishedAt || b.createdAt - a.createdAt;
}

export type GenerationAttentionFailureKind =
  | 'retry-routing'
  | 'topic-content'
  | 'topic-expansion'
  | 'crystal-trial'
  | 'subject-graph';

export interface GenerationAttentionPrimaryFailure {
  kind: GenerationAttentionFailureKind;
  failureKey: string;
  jobId?: string;
  failureInstanceId?: string;
  originalJobId?: string;
  subjectId: string;
  topicId?: string;
  topicLabel?: string;
  pipelineId?: string | null;
  /** Topic pipeline stage or subject-graph stage where applicable. */
  stage?: 'topics' | 'edges' | 'theory' | 'study-cards' | 'mini-games' | 'full';
  level?: number;
  jobLabel?: string;
  errorMessage?: string;
}

export interface GenerationAttentionSurface {
  subjectGraphPips: 0 | 1 | 2;
  /** Present only while a subject-graph LLM job is actively running. */
  subjectGraphActivePhase: 'topics' | 'edges' | null;
  subjectGraphLabel: string | null;
  subjectGraphSubjectId: string | null;
  subjectGraphPipelineId: string | null;
  primaryFailure: GenerationAttentionPrimaryFailure | null;
}

export type GenerationAttentionSelectorState = Pick<
  ContentGenerationState,
  'jobs' | 'pipelines' | 'sessionAcknowledgedFailureKeys' | 'sessionRetryRoutingFailures'
>;

function jobKindToFailureKind(kind: ContentGenerationJobKind): GenerationAttentionFailureKind | null {
  switch (kind) {
    case 'topic-theory':
    case 'topic-study-cards':
    case 'topic-mini-games':
    case 'topic-mini-game-category-sort':
    case 'topic-mini-game-sequence-build':
    case 'topic-mini-game-connection-web':
      return 'topic-content';
    case 'topic-expansion-cards':
      return 'topic-expansion';
    case 'crystal-trial':
      return 'crystal-trial';
    case 'subject-graph-topics':
    case 'subject-graph-edges':
      return 'subject-graph';
    default:
      return null;
  }
}

function priorityRank(kind: GenerationAttentionFailureKind): number {
  switch (kind) {
    case 'retry-routing':
      return 0;
    case 'topic-content':
    case 'topic-expansion':
      return 1;
    case 'crystal-trial':
      return 2;
    case 'subject-graph':
      return 3;
    default:
      return 99;
  }
}

function topicStageFromJobKind(
  kind: ContentGenerationJobKind,
): 'theory' | 'study-cards' | 'mini-games' | undefined {
  if (kind === 'topic-theory') return 'theory';
  if (kind === 'topic-study-cards') return 'study-cards';
  if (
    kind === 'topic-mini-games' ||
    kind === 'topic-mini-game-category-sort' ||
    kind === 'topic-mini-game-sequence-build' ||
    kind === 'topic-mini-game-connection-web'
  ) {
    return 'mini-games';
  }
  return undefined;
}

function primaryFailureFromJob(
  job: ContentGenerationJob,
  pipelines: Record<string, ContentGenerationPipeline>,
): GenerationAttentionPrimaryFailure | null {
  const kind = jobKindToFailureKind(job.kind);
  if (!kind || job.status !== 'failed' || !job.subjectId) return null;

  const failureKey = failureKeyForJob(job.id);

  const base: GenerationAttentionPrimaryFailure = {
    kind,
    failureKey,
    jobId: job.id,
    subjectId: job.subjectId,
    topicId: job.topicId ?? undefined,
    topicLabel: undefined,
    pipelineId: job.pipelineId,
    jobLabel: job.label,
    errorMessage: job.error ?? undefined,
  };

  if (kind === 'subject-graph') {
    base.stage = subjectGraphPhaseFromJob(job);
    const pl =
      job.pipelineId !== null ? pipelines[job.pipelineId]?.label : undefined;
    return {
      ...base,
      topicLabel: subjectPipelineLabel(pl ?? job.label),
    };
  }

  if (kind === 'topic-content') {
    const st = topicStageFromJobKind(job.kind);
    if (st) base.stage = st;
    const emDash = job.label.split(' — ');
    const titleFromLabel = emDash.length >= 2 ? emDash.slice(1).join(' — ').trim() : job.label;
    return { ...base, topicLabel: titleFromLabel };
  }

  if (kind === 'topic-expansion') {
    const nl = job.metadata?.nextLevel;
    if (typeof nl === 'number') base.level = nl;
    return base;
  }

  if (kind === 'crystal-trial') {
    const tl = job.metadata?.currentLevel;
    if (typeof tl === 'number') {
      base.level = tl + 1;
    }
    return base;
  }

  return base;
}

function comparePrimaryFailures(
  a: GenerationAttentionPrimaryFailure,
  b: GenerationAttentionPrimaryFailure,
  aRecency: number,
  bRecency: number,
): GenerationAttentionPrimaryFailure {
  const pa = priorityRank(a.kind);
  const pb = priorityRank(b.kind);
  if (pa !== pb) {
    return pa < pb ? a : b;
  }
  if (aRecency !== bRecency) {
    return aRecency > bRecency ? a : b;
  }
  return a.failureKey < b.failureKey ? a : b;
}

function retrySurfaceToPrimary(r: SessionRetryRoutingFailureSurface): GenerationAttentionPrimaryFailure {
  return {
    kind: 'retry-routing',
    failureKey: r.failureKey,
    failureInstanceId: r.failureInstanceId,
    originalJobId: r.originalJobId,
    subjectId: r.subjectId,
    topicId: r.topicId,
    topicLabel: r.topicLabel,
    jobLabel: r.jobLabel,
    errorMessage: r.errorMessage,
  };
}

/**
 * Unified content-generation attention for the nexus mentor bubble and entry
 * resolution: subject-graph progress pips plus the single highest-priority
 * unacknowledged canonical failure surface (including retry-routing collapse).
 */
export function generationAttentionSurface(
  state: GenerationAttentionSelectorState,
): GenerationAttentionSurface {
  const jobs = Object.values(state.jobs);
  const subjectJobs = jobs.filter((j) => isSubjectGraphKind(j.kind));

  const activeJob = subjectJobs
    .filter((j) => isActiveStatus(j.status))
    .sort(compareJobRecency)[0];

  let subjectGraphPips: 0 | 1 | 2 = 0;
  let subjectGraphActivePhase: 'topics' | 'edges' | null = null;
  let subjectGraphLabel: string | null = null;
  let subjectGraphSubjectId: string | null = null;
  let subjectGraphPipelineId: string | null = null;

  const ack = state.sessionAcknowledgedFailureKeys;

  type Cand = { failure: GenerationAttentionPrimaryFailure; recency: number };
  const candidates: Cand[] = [];

  for (const r of Object.values(state.sessionRetryRoutingFailures)) {
    if (ack[r.failureKey]) continue;
    candidates.push({ failure: retrySurfaceToPrimary(r), recency: r.createdAt });
  }

  const failedJobs = jobs.filter((j) => j.status === 'failed').sort(compareJobRecency);
  for (const job of failedJobs) {
    if (activeJob && isSubjectGraphKind(job.kind)) {
      continue;
    }
    const fk = failureKeyForJob(job.id);
    if (ack[fk]) continue;
    const p = primaryFailureFromJob(job, state.pipelines);
    if (!p) continue;
    candidates.push({ failure: p, recency: job.finishedAt ?? job.createdAt });
  }

  const best =
    candidates.length === 0
      ? null
      : candidates.slice(1).reduce((acc, c) => {
          const winner = comparePrimaryFailures(acc.failure, c.failure, acc.recency, c.recency);
          return winner === acc.failure ? acc : c;
        }, candidates[0]!).failure;

  if (activeJob) {
    const pipelineLabel =
      activeJob.pipelineId !== null ? state.pipelines[activeJob.pipelineId]?.label : null;
    const phase = subjectGraphPhaseFromJob(activeJob);
    subjectGraphActivePhase = phase;
    subjectGraphPips = phase === 'edges' ? 2 : 1;
    subjectGraphLabel = subjectPipelineLabel(pipelineLabel ?? activeJob.label);
    subjectGraphSubjectId = activeJob.subjectId;
    subjectGraphPipelineId = activeJob.pipelineId;
  } else if (best?.kind === 'subject-graph') {
    subjectGraphPips = 2;
    subjectGraphLabel = best.topicLabel ?? null;
    subjectGraphSubjectId = best.subjectId;
    subjectGraphPipelineId = typeof best.pipelineId === 'string' ? best.pipelineId : null;
  }

  return {
    subjectGraphPips,
    subjectGraphActivePhase,
    subjectGraphLabel,
    subjectGraphSubjectId,
    subjectGraphPipelineId,
    primaryFailure: best,
  };
}
