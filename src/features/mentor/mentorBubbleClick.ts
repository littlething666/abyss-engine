import {
  activeSubjectGenerationStatus,
  useContentGenerationStore,
} from '@/features/contentGeneration';

import {
  readMentorEntryContextFromStores,
  tryEnqueueMentorEntry,
} from './mentorEntryPoint';

/**
 * Thin wrapper over the contextual mentor entry resolver. Both the
 * MentorBubble billboard and the HUD Quick Actions "\ud83d\udde3\ufe0f Mentor"
 * item route through this helper so they always agree on which dialog the
 * click should open.
 *
 * Callers do not need to gather context themselves; this helper snapshots
 * the cross-feature stores (mentor + content generation) at click time and
 * forwards the plain-data context into `tryEnqueueMentorEntry`.
 */
export function tryEnqueueBubbleClick(): boolean {
  const subjectGenerationStatus = activeSubjectGenerationStatus(
    useContentGenerationStore.getState(),
  );
  const ctx = readMentorEntryContextFromStores(subjectGenerationStatus);
  return tryEnqueueMentorEntry(ctx);
}
