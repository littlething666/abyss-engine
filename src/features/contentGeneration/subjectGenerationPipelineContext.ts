import type { ContentGenerationJob } from '@/types/contentGeneration';
import type { StudyChecklist } from '@/types/studyChecklist';

import { deckRepository } from '@/infrastructure/di';

import { useContentGenerationStore } from './contentGenerationStore';

function hasTopicName(value: unknown): value is StudyChecklist {
  return (
    typeof value === 'object' &&
    value !== null &&
    'topicName' in value &&
    typeof (value as { topicName: unknown }).topicName === 'string'
  );
}

function parseChecklistFromLabel(label: string): StudyChecklist | null {
  const prefixed = /^\[(Topics|Edges)\]\s*Curriculum\s*—\s*(.+)$/.exec(label);
  if (prefixed?.[2]) {
    const topicName = prefixed[2].trim();
    return topicName ? { topicName } : null;
  }
  const match = /^Curriculum\s*—\s*(.+)$/.exec(label);
  if (!match?.[1]) {
    return null;
  }
  const topicName = match[1]?.trim();
  return topicName ? { topicName } : null;
}

function isRetryable(status: ContentGenerationJob['status']): boolean {
  return status === 'failed' || status === 'aborted';
}

/**
 * Recover subject id + checklist for a subject-graph job (same rules as manual job retry).
 */
export async function resolveSubjectGraphRetryContextFromJob(
  job: ContentGenerationJob,
): Promise<{ subjectId: string; checklist: StudyChecklist } | null> {
  if (job.kind !== 'subject-graph-topics' && job.kind !== 'subject-graph-edges') return null;
  const subjectId = job.subjectId;
  if (!subjectId) return null;

  const manifest = await deckRepository.getManifest({ includePregeneratedCurriculums: true });
  const subject = manifest.subjects.find((s) => s.id === subjectId);
  const manifestChecklist =
    subject?.metadata && hasTopicName(subject.metadata.checklist)
      ? subject.metadata.checklist
      : subject?.name
        ? { topicName: subject.name }
        : null;
  const checklist = hasTopicName(job.metadata?.checklist)
    ? job.metadata.checklist
    : manifestChecklist || parseChecklistFromLabel(job.label);

  if (!checklist) return null;
  return { subjectId, checklist };
}

/**
 * Recover subject id + checklist from the first failed subject-graph job in a pipeline.
 */
export async function resolveSubjectGraphRetryContextFromPipelineId(
  pipelineId: string,
): Promise<{ subjectId: string; checklist: StudyChecklist } | null> {
  const store = useContentGenerationStore.getState();
  const pipelineJobs = Object.values(store.jobs)
    .filter((j) => j.pipelineId === pipelineId)
    .sort((a, b) => a.createdAt - b.createdAt);
  const failedJob = pipelineJobs.find(
    (j) =>
      isRetryable(j.status) &&
      (j.kind === 'subject-graph-topics' || j.kind === 'subject-graph-edges'),
  );
  if (!failedJob) return null;
  return resolveSubjectGraphRetryContextFromJob(failedJob);
}
