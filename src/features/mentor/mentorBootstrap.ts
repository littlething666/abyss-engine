'use client';

import { handleMentorTrigger } from './mentorTriggers';

const g = globalThis as typeof globalThis & {
  __abyssMentorBootstrapped?: boolean;
};

let welcomeScheduled = false;

/**
 * Defer welcome enqueue past two animation frames so the persisted store has
 * had a chance to rehydrate. Without this the very first frame would always
 * see `playerName === null` and re-fire welcome on every full reload.
 */
function scheduleWelcomeEnqueue(): void {
  if (welcomeScheduled) return;
  welcomeScheduled = true;
  if (
    typeof window === 'undefined' ||
    typeof window.requestAnimationFrame !== 'function'
  ) {
    handleMentorTrigger('onboarding.welcome');
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      handleMentorTrigger('onboarding.welcome');
    });
  });
}

/**
 * Idempotent module-load bootstrap. Schedules the deferred onboarding welcome
 * enqueue.
 *
 * Mentor `appEventBus` subscriptions (`crystal:leveled`, `session:completed`)
 * and the crystal-trial `awaiting_player` transition watcher live in
 * `src/infrastructure/eventBusHandlers.ts` under the existing
 * `__abyssEventBusHandlersRegistered` guard. That keeps mentor wiring on the
 * same canonical infrastructure composition root as the rest of the app's
 * event side-effects, which is the placement the v1 plan calls for.
 */
export function bootstrapMentor(): void {
  if (g.__abyssMentorBootstrapped) return;
  g.__abyssMentorBootstrapped = true;

  scheduleWelcomeEnqueue();
}

/** Test-only: reset module-level latches so bootstrap can be re-run. */
export function __resetMentorBootstrapForTests(): void {
  g.__abyssMentorBootstrapped = false;
  welcomeScheduled = false;
}
