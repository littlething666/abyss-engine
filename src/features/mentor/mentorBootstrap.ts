'use client';

import { appEventBus } from '@/infrastructure/eventBus';
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
 * `appEventBus` and schedules the deferred onboarding welcome enqueue.
 *
 * - `crystal:leveled` → `crystal.leveled` trigger (60s cooldown enforced by rule engine)
 * - `session:completed` → `session.completed` trigger
 * - `onboarding.welcome` → enqueued after rehydration if oneShot is unfired
 *
 * Crystal-trial `awaiting_player` is intentionally NOT wired here yet — it
 * needs a `useCrystalTrialStore.subscribe` watcher with a prev/next status
 * diff and is tracked as a Phase-2 follow-up commit so we can read the
 * trial-store shape without guessing.
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

  scheduleWelcomeEnqueue();
}

/** Test-only: reset module-level latches so bootstrap can be re-run. */
export function __resetMentorBootstrapForTests(): void {
  g.__abyssMentorBootstrapped = false;
  welcomeScheduled = false;
}
