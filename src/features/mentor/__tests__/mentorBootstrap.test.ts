import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the trigger entry-point so we can spy on welcome dispatch without
// going through evaluateTrigger / mentorStore. Phase-2 deviation #4 moved
// all other side-effects (appEventBus + crystalTrial watcher) out of
// mentorBootstrap, so the bootstrap is now welcome-only.
vi.mock('../mentorTriggers', () => ({
  handleMentorTrigger: vi.fn(),
}));

import { handleMentorTrigger } from '../mentorTriggers';
import {
  __resetMentorBootstrapForTests,
  bootstrapMentor,
} from '../mentorBootstrap';

beforeEach(() => {
  __resetMentorBootstrapForTests();
  vi.mocked(handleMentorTrigger).mockReset();
});

afterEach(() => {
  __resetMentorBootstrapForTests();
});

async function flushAllRafs(): Promise<void> {
  // vitest.setup.ts maps requestAnimationFrame -> setTimeout(cb, 0); two raf
  // hops resolve after two macrotasks. Awaiting microtask + setImmediate-like
  // flush is sufficient.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('bootstrapMentor', () => {
  it('schedules a single onboarding.welcome trigger after a double-rAF', async () => {
    bootstrapMentor();

    // Welcome must NOT fire synchronously — the double-rAF deferral exists
    // so the persisted store has time to rehydrate before evaluation.
    expect(handleMentorTrigger).not.toHaveBeenCalled();

    await flushAllRafs();

    expect(handleMentorTrigger).toHaveBeenCalledTimes(1);
    expect(handleMentorTrigger).toHaveBeenCalledWith('onboarding.welcome');
  });

  it('is idempotent: repeated bootstrap calls fire welcome at most once', async () => {
    bootstrapMentor();
    bootstrapMentor();
    bootstrapMentor();

    await flushAllRafs();

    expect(handleMentorTrigger).toHaveBeenCalledTimes(1);
  });

  it('respects the welcomeScheduled latch even after the global guard is reset', async () => {
    bootstrapMentor();
    await flushAllRafs();
    expect(handleMentorTrigger).toHaveBeenCalledTimes(1);

    // Manually clear ONLY the global guard but leave welcomeScheduled set —
    // simulating an injected double-bootstrap path. The latch must still
    // suppress a second welcome enqueue.
    (globalThis as { __abyssMentorBootstrapped?: boolean }).__abyssMentorBootstrapped =
      false;
    bootstrapMentor();
    await flushAllRafs();

    expect(handleMentorTrigger).toHaveBeenCalledTimes(1);
  });

  it('__resetMentorBootstrapForTests re-enables a fresh schedule', async () => {
    bootstrapMentor();
    await flushAllRafs();
    expect(handleMentorTrigger).toHaveBeenCalledTimes(1);

    __resetMentorBootstrapForTests();
    bootstrapMentor();
    await flushAllRafs();

    expect(handleMentorTrigger).toHaveBeenCalledTimes(2);
  });

  it('does NOT subscribe to crystal trial transitions or app events (Phase 2 deviation #4)', async () => {
    // Phase-2 deviation moved appEventBus subscriptions and the crystal-trial
    // awaiting_player watcher out of mentorBootstrap and into
    // src/infrastructure/eventBusHandlers.ts. This guard test asserts that
    // bootstrap remains welcome-only by checking that no other trigger ID
    // is fired by bootstrap alone.
    bootstrapMentor();
    await flushAllRafs();

    const calls = vi.mocked(handleMentorTrigger).mock.calls;
    const firedTriggers = calls.map((c) => c[0]);
    expect(firedTriggers).toEqual(['onboarding.welcome']);
  });
});
