'use client';

import { appEventBus } from '@/infrastructure/eventBus';

import { useMentorStore } from './mentorStore';
import { handleMentorTrigger } from './mentorTriggers';

const g = globalThis as typeof globalThis & {
  __abyssMentorBootstrapped?: boolean;
};

let onboardingScheduled = false;
let initialPlayerProfileBroadcast = false;

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
    handleMentorTrigger('onboarding:pre-first-subject');
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      handleMentorTrigger('onboarding:pre-first-subject');
    });
  });
}

/**
 * Re-broadcast the persisted player name on bootstrap so subscribers
 * (notably the PostHog bootstrap) receive the current value without
 * waiting for the next `setPlayerName` call. Deferred via the same
 * rAF×2 dance as `scheduleOnboardingEnqueue` so the persisted store
 * has had a chance to rehydrate.
 *
 * Subscribers are guaranteed to be registered earlier:
 * `instrumentation-client.ts` runs `bootstrapPosthog()` before any
 * React tree mounts, and that function synchronously subscribes to
 * `player-profile:updated`. Mentor bootstrap is invoked from within
 * the React tree, then defers two frames — the analytics listener is
 * always registered first.
 */
function scheduleInitialPlayerProfileBroadcast(): void {
  if (initialPlayerProfileBroadcast) return;
  initialPlayerProfileBroadcast = true;

  const broadcast = () => {
    appEventBus.emit('player-profile:updated', {
      playerName: useMentorStore.getState().playerName,
    });
  };

  if (
    typeof window === 'undefined' ||
    typeof window.requestAnimationFrame !== 'function'
  ) {
    broadcast();
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(broadcast);
  });
}

/**
 * Idempotent module-load bootstrap. Schedules the deferred pre-first-subject
 * onboarding enqueue and the deferred player-profile re-broadcast.
 *
 * Mentor `appEventBus` subscriptions and the crystal-trial transition
 * watcher live in `src/infrastructure/eventBusHandlers.ts` under the
 * existing `__abyssEventBusHandlersRegistered` guard.
 */
export function bootstrapMentor(): void {
  if (g.__abyssMentorBootstrapped) return;
  g.__abyssMentorBootstrapped = true;

  scheduleOnboardingEnqueue();
  scheduleInitialPlayerProfileBroadcast();
}

/** Test-only: reset module-level latches so bootstrap can be re-run. */
export function __resetMentorBootstrapForTests(): void {
  g.__abyssMentorBootstrapped = false;
  onboardingScheduled = false;
  initialPlayerProfileBroadcast = false;
}
