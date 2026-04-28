import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  useMentorStore,
} from '../mentorStore';
import { tryEnqueueBubbleClick } from '../mentorBubbleClick';
import type { DialogPlan } from '../mentorTypes';

function stubPlan(enqueuedAt = 1): DialogPlan {
  return {
    id: `stub-${enqueuedAt}`,
    trigger: 'mentor.bubble.click',
    priority: 90,
    enqueuedAt,
    messages: [{ id: 'msg', text: 'hi' }],
    source: 'canned',
    voiceId: 'witty-sarcastic',
  };
}

beforeEach(() => {
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
});

describe('tryEnqueueBubbleClick', () => {
  it('enqueues a fresh plan when overlay is closed and queue is empty', () => {
    const beforeQueueLength = useMentorStore.getState().dialogQueue.length;
    expect(beforeQueueLength).toBe(0);

    const enqueued = tryEnqueueBubbleClick();

    expect(enqueued).toBe(true);
    const after = useMentorStore.getState();
    expect(after.dialogQueue.length).toBe(1);
    expect(after.dialogQueue[0]?.trigger).toBe('mentor.bubble.click');
  });

  it('is a no-op when the overlay is already open (Pin rule #8)', () => {
    useMentorStore.setState({ currentDialog: stubPlan(42) });

    const enqueued = tryEnqueueBubbleClick();

    expect(enqueued).toBe(false);
    const after = useMentorStore.getState();
    // Queue must remain empty; current dialog must be untouched.
    expect(after.dialogQueue).toHaveLength(0);
    expect(after.currentDialog?.id).toBe('stub-42');
  });

  it('is a no-op when the overlay is closed but the queue is non-empty', () => {
    // The queued plan wins; auto-pop in the overlay opens its head.
    useMentorStore.setState({ dialogQueue: [stubPlan(7)] });

    const enqueued = tryEnqueueBubbleClick();

    expect(enqueued).toBe(false);
    const after = useMentorStore.getState();
    expect(after.dialogQueue).toHaveLength(1);
    expect(after.dialogQueue[0]?.id).toBe('stub-7');
  });

  it('does not record a cooldown for mentor.bubble.click (cooldownMs is undefined)', () => {
    tryEnqueueBubbleClick();

    const cooldowns = useMentorStore.getState().cooldowns;
    // mentor.bubble.click has no cooldownMs in TRIGGER_SPECS, so the
    // helper must not call recordCooldown for it.
    expect(cooldowns['mentor.bubble.click']).toBeUndefined();
  });

  it('produces a plan with priority 90 (matches the trigger spec)', () => {
    tryEnqueueBubbleClick();
    const plan = useMentorStore.getState().dialogQueue[0];
    expect(plan?.priority).toBe(90);
    expect(plan?.source).toBe('canned');
    expect(plan?.voiceId).toBe('witty-sarcastic');
  });
});
