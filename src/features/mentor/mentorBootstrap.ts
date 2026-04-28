'use client';

import { appEventBus } from '@/infrastructure/eventBus';
import { useCrystalTrialStore } from '@/features/crystalTrial/crystalTrialStore';
import { evaluateTrigger } from './dialogRuleEngine';
import { useMentorStore } from './mentorStore';
import type { MentorTriggerId, MentorTriggerPayload } from './mentorTypes';

const g = globalThis as typeof globalThis & {
  __abyssMentorBootstrapped?: boolean;
};

let welcomeScheduled = false;

function tryEnqueue(
  trigger: MentorTriggerId,
  payload: MentorTriggerPayload = {},
): void {
  const plan = evaluateTrigger(trigger, payload);
  if (!plan) return;
  const store = useMentorStore.getState();
  store.enqueue(plan);
  // Cooldown is recorded at enqueue-time so duplicate fires within the
  // cooldown window are suppressed even before the dialog is rendered.
  // markSeen lives in the overlay (post-open) so dismissed-without-render
  // dialogs do not lock out future fires.
  if (plan.cooldownMs && plan.cooldownMs > 0) {
    store.recordCooldown(trigger, plan.enqueuedAt);
  }
}

/**
 * Defer welcome enqueue past two animation frames so the persisted store has
 * had a chance to rehydrate. Without this the very first frame would always
 * see `playerName === null` and re-fire welcome on every full reload.
 */
function scheduleWelcomeEnqueue(): void {
  if (welcomeScheduled) return;
  welcomeScheduled = true;
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    tryEnqueue('onboarding.welcome');
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      tryEnqueue('onboarding.welcome');
    });
  });
}

/**
 * Idempotent module-load bootstrap. Subscribes mentor triggers to the
 * `appEventBus` and the crystal-trial store, then schedules the deferred
 * onboarding welcome enqueue.
 *
 * - `crystal:leveled` -> `crystal.leveled` trigger (60s cooldown enforced by rule engine)
 * - `session:completed` -> `session.completed` trigger
 * - `crystalTrialStore.trials[*].status === 'awaiting_player'` (true transition only)
 *   -> `crystal.trial.awaiting` trigger
 * - `onboarding.welcome` -> enqueued after rehydration if oneShot is unfired
 *
 * Mentor side-effects are intentionally colocated here (rather than inside
 * `eventBusHandlers.ts`) so all mentor wiring lives behind the single
 * `__abyssMentorBootstrapped` guard and can be reset from tests.
 */
export function bootstrapMentor(): void {
  if (g.__abyssMentorBootstrapped) return;
  g.__abyssMentorBootstrapped = true;

  appEventBus.on('crystal:leveled', (e) => {
    tryEnqueue('crystal.leveled', { from: e.from, to: e.to });
  });

  appEventBus.on('session:completed', (e) => {
    tryEnqueue('session.completed', {
      correctRate: e.correctRate,
      totalAttempts: e.totalAttempts,
    });
  });

  // Crystal-trial awaiting_player watcher. The store holds
  // `trials: Record<topicRefKey, CrystalTrial>` so we diff each entry against
  // the previous snapshot and only fire on a real transition
  // (prev !== awaiting_player && next === awaiting_player). This avoids
  // re-firing on unrelated state changes (cooldown counters, other trials).
  useCrystalTrialStore.subscribe((next, prev) => {
    const prevTrials = prev.trials;
    const nextTrials = next.trials;
    if (prevTrials === nextTrials) return;
    for (const key of Object.keys(nextTrials)) {
      const nextTrial = nextTrials[key];
      if (!nextTrial || nextTrial.status !== 'awaiting_player') continue;
      const prevTrial = prevTrials[key];
      if (prevTrial && prevTrial.status === 'awaiting_player') continue;
      tryEnqueue('crystal.trial.awaiting', { topic: nextTrial.topicId });
    }
  });

  scheduleWelcomeEnqueue();
}

/** Test-only: reset module-level latches so bootstrap can be re-run. */
export function __resetMentorBootstrapForTests(): void {
  g.__abyssMentorBootstrapped = false;
  welcomeScheduled = false;
}
