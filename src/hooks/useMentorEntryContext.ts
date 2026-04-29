'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  activeSubjectGenerationStatus,
  useContentGenerationStore,
} from '@/features/contentGeneration';
import {
  useMentorStore,
  type MentorEntryContext,
} from '@/features/mentor';

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
  const subjectGeneration = useContentGenerationStore(
    useShallow(activeSubjectGenerationStatus),
  );
  const playerName = useMentorStore((s) => s.playerName);
  const firstSubjectGenerationEnqueuedAt = useMentorStore(
    (s) => s.firstSubjectGenerationEnqueuedAt,
  );
  const subjectGenerationPhase = subjectGeneration?.phase ?? null;
  const subjectGenerationLabel = subjectGeneration?.label ?? null;

  return useMemo(
    () => ({
      subjectGenerationPhase,
      subjectGenerationLabel,
      playerName,
      firstSubjectGenerationEnqueuedAt,
    }),
    [
      subjectGenerationPhase,
      subjectGenerationLabel,
      playerName,
      firstSubjectGenerationEnqueuedAt,
    ],
  );
}
