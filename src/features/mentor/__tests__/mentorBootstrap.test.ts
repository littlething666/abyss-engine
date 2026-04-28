import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../mentorTriggers', () => ({
  handleMentorTrigger: vi.fn(),
}));

import { handleMentorTrigger } from '../mentorTriggers';
import {
  __resetMentorBootstrapForTests,
  bootstrapMentor,
} from '../mentorBootstrap';
import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  useMentorStore,
} from '../mentorStore';

beforeEach(() => {
  __resetMentorBootstrapForTests();
  vi.mocked(handleMentorTrigger).mockReset();
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
});

afterEach(() => {
  __resetMentorBootstrapForTests();
});

async function flushAllRafs(): Promise<void> {
  // jsdom's rAF resolves on next macrotask; flush twice to clear the
  // double-rAF deferral inside schedulePreFirstSubjectEnqueue.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('bootstrapMentor', () => {
  it('schedules a single onboarding.pre_first_subject trigger after a double-rAF', async () => {
    bootstrapMentor();

    expect(handleMentorTrigger).not.toHaveBeenCalled();

    await flushAllRafs();

    expect(handleMentorTrigger).toHaveBeenCalledTimes(1);
    expect(handleMentorTrigger).toHaveBeenCalledWith('onboarding.pre_first_subject');
  });

  it('is idempotent: repeated bootstrap calls fire onboarding at most once', async () => {
    bootstrapMentor();
    bootstrapMentor();
    bootstrapMentor();

    await flushAllRafs();

    expect(handleMentorTrigger).toHaveBeenCalledTimes(1);
  });

  it('respects the per-session schedule latch even after the global guard is reset', async () => {
    bootstrapMentor();
    await flushAllRafs();
    expect(handleMentorTrigger).toHaveBeenCalledTimes(1);

    (globalThis as { __abyssMentorBootstrapped?: boolean }).__abyssMentorBootstrapped =
      false;
    bootstrapMentor();
    await flushAllRafs();

    expect(handleMentorTrigger).toHaveBeenCalledTimes(1);
  });

  it('__resetMentorBootstrapForTests re-enables a fresh schedule (simulates a full reload)', async () => {
    bootstrapMentor();
    await flushAllRafs();
    expect(handleMentorTrigger).toHaveBeenCalledTimes(1);

    __resetMentorBootstrapForTests();
    bootstrapMentor();
    await flushAllRafs();

    expect(handleMentorTrigger).toHaveBeenCalledTimes(2);
  });

  it('does NOT fire onboarding when firstSubjectGenerationEnqueuedAt is already set (returning player)', async () => {
    useMentorStore.setState({ firstSubjectGenerationEnqueuedAt: 1_700_000_000 });

    bootstrapMentor();
    await flushAllRafs();

    expect(handleMentorTrigger).not.toHaveBeenCalled();
  });

  it('does NOT subscribe to crystal trial transitions or app events (deviation #4)', async () => {
    bootstrapMentor();
    await flushAllRafs();

    const calls = vi.mocked(handleMentorTrigger).mock.calls;
    const firedTriggers = calls.map((c) => c[0]);
    expect(firedTriggers).toEqual(['onboarding.pre_first_subject']);
  });
});
