'use client';

import { useMentorStore } from './mentorStore';
import { handleMentorTrigger } from './mentorTriggers';

const g = globalThis as typeof globalThis & {
  __abyssMentorBootstrapped?: boolean;
};

let preFirstSubjectScheduled = false;

/**
 * Defer the pre-first-subject onboarding enqueue past two animation frames
 * so the persisted store has had a chance to rehydrate. Without this the
 * very first frame would always see `firstSubjectGenerationEnqueuedAt ===
 * null` and re-fire onboarding even for players who already started a
 * subject in a previous session.
 *
 * Bootstrap fires onboarding **once per app/page session**: this latch and
 * the `__abyssMentorBootstrapped` global both live in module scope and
 * reset naturally on a full reload. Combined with the rule engine's gate
 * (`firstSubjectGenerationEnqueuedAt === null`), this gives the v1 product
 * semantics: dismiss suppresses for the rest of the runtime, but reloading
 * re-arms the bootstrap nudge for as long as the gate is still open. The
 * bubble / Quick Action contextual resolver remains the explicit re-entry
 * path within a single session.
 */
function schedulePreFirstSubjectEnqueue(): void {
  if (preFirstSubjectScheduled) return;
  preFirstSubjectScheduled = true;
  if (
    typeof window === 'undefined' ||
    typeof window.requestAnimationFrame !== 'function'
  ) {
    enqueueIfStillEligible();
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      enqueueIfStillEligible();
    });
  });
}

function enqueueIfStillEligible(): void {
  // Re-check the gate after rehydrate. If a previous run already kicked off
  // first-subject generation, suppress the bootstrap nudge entirely so
  // returning players don't see onboarding flicker on reload. The rule
  // engine's isApplicable would also reject this, but skipping the
  // handleMentorTrigger call avoids a no-op telemetry/cursor hop.
  const { firstSubjectGenerationEnqueuedAt } = useMentorStore.getState();
  if (firstSubjectGenerationEnqueuedAt !== null) return;
  handleMentorTrigger('onboarding.pre_first_subject');
}

/**
 * Idempotent module-load bootstrap. Schedules the deferred pre-first-subject
 * onboarding enqueue.
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

  schedulePreFirstSubjectEnqueue();
}

/** Test-only: reset module-level latches so bootstrap can be re-run. */
export function __resetMentorBootstrapForTests(): void {
  g.__abyssMentorBootstrapped = false;
  preFirstSubjectScheduled = false;
}
