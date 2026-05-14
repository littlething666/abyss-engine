'use client';

import { useMemo } from 'react';

import { useMentorStore, type MentorEntryContext } from '@/features/mentor';
/**
 * Composition hook. Gathers the live `MentorEntryContext` from the mentor
 * store, used by `MentorBubble` and the Quick Actions "Mentor" item so
 * they pick the contextual mentor entry trigger the same way.
 */
export function useMentorEntryContext(): MentorEntryContext {
  const playerName = useMentorStore((s) => s.playerName);
  const firstSubjectGenerationEnqueuedAt = useMentorStore(
    (s) => s.firstSubjectGenerationEnqueuedAt,
  );

  return useMemo(() => ({
    subjectGraphActiveStage: null,
    subjectGenerationLabel: null,
    playerName,
    firstSubjectGenerationEnqueuedAt,
    mentorFailureEntry: null,
  }), [playerName, firstSubjectGenerationEnqueuedAt]);
}
