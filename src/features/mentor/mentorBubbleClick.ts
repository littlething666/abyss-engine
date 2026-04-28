import { evaluateTrigger } from './dialogRuleEngine';
import { selectIsOverlayOpen, useMentorStore } from './mentorStore';

/**
 * Implements the v1 Pin selection rules for `mentor.bubble.click`:
 *
 * - If the overlay is already open: no-op (Pin rule #8).
 * - If the overlay is closed but `dialogQueue` is non-empty: no-op. The
 *   queued plan wins; `MentorDialogOverlay`'s auto-pop effect opens its head.
 * - Otherwise: evaluate the trigger, enqueue the plan, record cooldown.
 *
 * Returns `true` if a new plan was enqueued, `false` otherwise.
 */
export function tryEnqueueBubbleClick(): boolean {
  const store = useMentorStore.getState();
  if (selectIsOverlayOpen(store)) return false;
  if (store.dialogQueue.length > 0) return false;
  const plan = evaluateTrigger('mentor.bubble.click', {});
  if (!plan) return false;
  store.enqueue(plan);
  if (plan.cooldownMs && plan.cooldownMs > 0) {
    store.recordCooldown('mentor.bubble.click', plan.enqueuedAt);
  }
  return true;
}
