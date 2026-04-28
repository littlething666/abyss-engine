'use client';

import { evaluateTrigger } from './dialogRuleEngine';
import { useMentorStore } from './mentorStore';
import type { MentorTriggerId, MentorTriggerPayload } from './mentorTypes';

/**
 * Evaluate a mentor trigger and enqueue the resulting plan.
 *
 * Cooldown is recorded at enqueue-time so duplicate fires within the cooldown
 * window are suppressed even before the dialog is rendered. `markSeen` lives
 * in the overlay (post-open) so dismissed-without-render dialogs do not lock
 * out future fires.
 *
 * This is the thin feature API that `src/infrastructure/eventBusHandlers.ts`
 * calls when forwarding mentor side-effects from existing app events and
 * store transitions. Keeping this here means infrastructure code does not
 * reach directly into `dialogRuleEngine`/`mentorStore` internals.
 */
export function handleMentorTrigger(
  trigger: MentorTriggerId,
  payload: MentorTriggerPayload = {},
): void {
  const plan = evaluateTrigger(trigger, payload);
  if (!plan) return;
  const store = useMentorStore.getState();
  store.enqueue(plan);
  if (plan.cooldownMs && plan.cooldownMs > 0) {
    store.recordCooldown(trigger, plan.enqueuedAt);
  }
}
