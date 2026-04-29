'use client';

import { handleMentorTrigger } from './mentorTriggers';

const g = globalThis as typeof globalThis & {
  __abyssMentorBootstrapped?: boolean;
};

let onboardingScheduled = false;

/**
 * Defer the pre-first-subject onboarding enqueue past two animation frames
 * so the persisted store has had a chance to rehydrate. Without this, the
 * very first frame would always see `firstSubjectGenerationEnqueuedAt`
 * unset for returning players whose persisted state is still loading.
 *
 * The trigger is no longer `oneShot`; the rule engine gates only on
 * `firstSubjectGenerationEnqueuedAt === null`. Combined with the existing
 * `__abyssMentorBootstrapped` global guard + module-local latch, this
 * yields the desired behavior: bootstrap auto-enqueues onboarding once per
 * app/page session while the gate remains open, and a full reload re-arms
 * onboarding for returning players who never planted a subject.
 */
function scheduleOnboardingEnqueue(): void {
  if (onboardingScheduled) return;
  onboardingScheduled = true;
  if (
    typeof window === 'undefined' ||
    typeof window.requestAnimationFrame !== 'function'
  ) {
    handleMentorTrigger('onboarding.pre_first_subject');
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      handleMentorTrigger('onboarding.pre_first_subject');
    });
  });
}

/**
 * Idempotent module-load bootstrap. Schedules the deferred pre-first-subject
 * onboarding enqueue.
 *
 * Mentor `appEventBus` subscriptions and the crystal-trial transition
 * watcher live in `src/infrastructure/eventBusHandlers.ts` under the
 * existing `__abyssEventBusHandlersRegistered` guard.
 */
export function bootstrapMentor(): void {
  if (g.__abyssMentorBootstrapped) return;
  g.__abyssMentorBootstrapped = true;

  scheduleOnboardingEnqueue();
}

/** Test-only: reset module-level latches so bootstrap can be re-run. */
export function __resetMentorBootstrapForTests(): void {
  g.__abyssMentorBootstrapped = false;
  onboardingScheduled = false;
}
