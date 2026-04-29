import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetMentorBootstrapForTests, bootstrapMentor } from '../mentorBootstrap';
import {
  useMentorStore,
  DEFAULT_PERSISTED_STATE,
  DEFAULT_EPHEMERAL_STATE,
} from '../mentorStore';

async function flushRafTwice(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
}

function resetStore(): void {
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
}

describe('mentorBootstrap', () => {
  beforeEach(() => {
    resetStore();
    __resetMentorBootstrapForTests();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof window.requestAnimationFrame);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    __resetMentorBootstrapForTests();
  });

  it('schedules onboarding.pre_first_subject on first run when firstSubjectGenerationEnqueuedAt is null', async () => {
    bootstrapMentor();
    await flushRafTwice();
    const queue = useMentorStore.getState().dialogQueue;
    expect(queue.some((p) => p.trigger === 'onboarding.pre_first_subject')).toBe(true);
  });

  it('does NOT schedule onboarding when firstSubjectGenerationEnqueuedAt is set', async () => {
    useMentorStore.setState({ firstSubjectGenerationEnqueuedAt: Date.now() });
    bootstrapMentor();
    await flushRafTwice();
    expect(
      useMentorStore
        .getState()
        .dialogQueue.some((p) => p.trigger === 'onboarding.pre_first_subject'),
    ).toBe(false);
  });

  it('is idempotent across repeated calls within the same run', async () => {
    bootstrapMentor();
    bootstrapMentor();
    await flushRafTwice();
    const occurrences = useMentorStore
      .getState()
      .dialogQueue.filter((p) => p.trigger === 'onboarding.pre_first_subject').length;
    expect(occurrences).toBe(1);
  });
});
