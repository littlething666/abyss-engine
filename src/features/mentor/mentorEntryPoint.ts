'use client';

import { handleMentorTrigger } from './mentorTriggers';
import { useMentorStore } from './mentorStore';
import {
  resolveMentorEntry,
  type MentorEntryContext,
} from './mentorEntryResolver';

/**
 * Bubble / Quick Action mentor entry point. Applies the v1 selection guards
 * (overlay open => no-op, queue non-empty => no-op), delegates to the pure
 * resolver to pick a trigger from the supplied context, and forwards that
 * decision to `handleMentorTrigger` for cooldown- and applicability-aware
 * enqueue.
 *
 * Returns true iff a plan was successfully appended to the dialog queue.
 *
 * Replaces the legacy `tryEnqueueBubbleClick` helper; both the MentorBubble
 * billboard and the HUD Quick Actions "Mentor" item route through this
 * single helper so they stay behaviorally identical and contextual.
 */
export function tryEnqueueMentorEntry(
  context: MentorEntryContext,
): boolean {
  const before = useMentorStore.getState();
  if (before.currentDialog !== null) return false;
  if (before.dialogQueue.length > 0) return false;

  const decision = resolveMentorEntry(context);
  const beforeQueueLength = before.dialogQueue.length;
  handleMentorTrigger(decision.trigger, decision.payload);

  return useMentorStore.getState().dialogQueue.length > beforeQueueLength;
}
