'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  generationAttentionSurface,
  useContentGenerationStore,
  type GenerationAttentionPrimaryFailure,
} from '@/features/contentGeneration';
import {
  useMentorStore,
  type MentorEntryContext,
  type MentorFailureEntryPayload,
} from '@/features/mentor';

function mentorFailureEntryFromPrimary(
  f: GenerationAttentionPrimaryFailure,
): MentorFailureEntryPayload {
  switch (f.kind) {
    case 'retry-routing':
      return {
        trigger: 'content-generation:retry-failed',
        payload: {
          subjectId: f.subjectId,
          topicId: f.topicId,
          topicLabel: f.topicLabel,
          jobLabel: f.jobLabel ?? 'Job',
          errorMessage: f.errorMessage ?? '',
          jobId: f.originalJobId,
          failureInstanceId: f.failureInstanceId,
          failureKey: f.failureKey,
        },
      };
    case 'topic-content':
      return {
        trigger: 'topic-content:generation-failed',
        payload: {
          subjectId: f.subjectId,
          topicId: f.topicId,
          topicLabel: f.topicLabel ?? f.topicId ?? '',
          errorMessage: f.errorMessage ?? '',
          jobId: f.jobId,
          failureKey: f.failureKey,
          pipelineId: f.pipelineId ?? undefined,
          ...(f.stage ? { stage: f.stage } : {}),
        },
      };
    case 'topic-expansion':
      return {
        trigger: 'topic-expansion:generation-failed',
        payload: {
          subjectId: f.subjectId,
          topicId: f.topicId,
          topicLabel: f.topicLabel ?? '',
          level: f.level ?? 1,
          errorMessage: f.errorMessage ?? '',
          jobId: f.jobId,
          failureKey: f.failureKey,
        },
      };
    case 'crystal-trial':
      return {
        trigger: 'crystal-trial:generation-failed',
        payload: {
          subjectId: f.subjectId,
          topicId: f.topicId,
          topicLabel: f.topicLabel ?? '',
          level: f.level ?? 1,
          errorMessage: f.errorMessage ?? '',
          jobId: f.jobId,
          failureKey: f.failureKey,
        },
      };
    case 'subject-graph': {
      const st = f.stage === 'edges' || f.stage === 'topics' ? f.stage : 'topics';
      return {
        trigger: 'subject:generation-failed',
        payload: {
          subjectName: f.topicLabel ?? '',
          stage: st,
          pipelineId: f.pipelineId ?? undefined,
          jobId: f.jobId,
          failureKey: f.failureKey,
        },
      };
    }
  }
}

/**
 * Composition hook. Gathers the live `MentorEntryContext` from the mentor
 * store and the contentGeneration store, used by `MentorBubble` and the HUD
 * "Mentor" Quick Action so they pick the contextual mentor entry trigger
 * the same way.
 *
 * Lives under `src/hooks/` rather than inside the mentor feature because it
 * composes data from a sibling feature (`contentGeneration`); per the plan,
 * cross-feature reads stay in the composition layer.
 */
export function useMentorEntryContext(): MentorEntryContext {
  const attention = useContentGenerationStore(useShallow(generationAttentionSurface));
  const playerName = useMentorStore((s) => s.playerName);
  const firstSubjectGenerationEnqueuedAt = useMentorStore(
    (s) => s.firstSubjectGenerationEnqueuedAt,
  );

  const subjectGraphActiveStage = attention.subjectGraphActivePhase;
  const subjectGenerationLabel = attention.subjectGraphLabel;

  return useMemo(() => {
    const mentorFailureEntry = attention.primaryFailure
      ? mentorFailureEntryFromPrimary(attention.primaryFailure)
      : null;
    return {
      subjectGraphActiveStage,
      subjectGenerationLabel,
      playerName,
      firstSubjectGenerationEnqueuedAt,
      mentorFailureEntry,
    };
  }, [
    subjectGraphActiveStage,
    subjectGenerationLabel,
    playerName,
    firstSubjectGenerationEnqueuedAt,
    attention.primaryFailure,
  ]);
}
