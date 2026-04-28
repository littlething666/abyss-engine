import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  useMentorStore,
} from '../mentorStore';
import type { DialogPlan } from '../mentorTypes';

const { contentGenStateRef, activeSubjectStatusRef } = vi.hoisted(() => ({
  contentGenStateRef: { value: { jobs: {}, pipelines: {} } as Record<string, unknown> },
  activeSubjectStatusRef: { value: null as unknown },
}));

vi.mock('@/features/contentGeneration', () => ({
  useContentGenerationStore: {
    getState: () => contentGenStateRef.value,
  },
  activeSubjectGenerationStatus: () => activeSubjectStatusRef.value,
}));

import { tryEnqueueBubbleClick } from '../mentorBubbleClick';

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
  // Default: no active subject generation; the player has already started
  // a first subject so the resolver falls through to the generic
  // mentor.bubble.click branch unless a test overrides one of these.
  activeSubjectStatusRef.value = null;
  useMentorStore.setState({ firstSubjectGenerationEnqueuedAt: 1_700_000_000 });
});

describe('tryEnqueueBubbleClick', () => {
  it('enqueues a generic bubble.click plan when nothing else applies', () => {
    expect(useMentorStore.getState().dialogQueue).toHaveLength(0);

    const enqueued = tryEnqueueBubbleClick();

    expect(enqueued).toBe(true);
    const after = useMentorStore.getState();
    expect(after.dialogQueue).toHaveLength(1);
    expect(after.dialogQueue[0]?.trigger).toBe('mentor.bubble.click');
  });

  it('is a no-op when the overlay is already open (Pin rule #8)', () => {
    useMentorStore.setState({ currentDialog: stubPlan(42) });

    const enqueued = tryEnqueueBubbleClick();

    expect(enqueued).toBe(false);
    const after = useMentorStore.getState();
    expect(after.dialogQueue).toHaveLength(0);
    expect(after.currentDialog?.id).toBe('stub-42');
  });

  it('is a no-op when the overlay is closed but the queue is non-empty', () => {
    useMentorStore.setState({ dialogQueue: [stubPlan(7)] });

    const enqueued = tryEnqueueBubbleClick();

    expect(enqueued).toBe(false);
    const after = useMentorStore.getState();
    expect(after.dialogQueue).toHaveLength(1);
    expect(after.dialogQueue[0]?.id).toBe('stub-7');
  });

  it('does not record a cooldown for mentor.bubble.click', () => {
    tryEnqueueBubbleClick();

    const cooldowns = useMentorStore.getState().cooldowns;
    expect(cooldowns['mentor.bubble.click']).toBeUndefined();
  });

  describe('contextual resolver routing', () => {
    it('routes to subject.generation.failed when an active failure is surfaced', () => {
      activeSubjectStatusRef.value = {
        phase: 'failed',
        status: 'failed',
        label: 'New subject: Calculus',
        subjectId: 'calculus',
        pipelineId: 'pipeline-1',
      };

      const enqueued = tryEnqueueBubbleClick();

      expect(enqueued).toBe(true);
      const head = useMentorStore.getState().dialogQueue[0];
      expect(head?.trigger).toBe('subject.generation.failed');
    });

    it('routes to subject.generation.started when generation is in topics phase', () => {
      activeSubjectStatusRef.value = {
        phase: 'topics',
        status: 'streaming',
        label: 'New subject: Topology',
        subjectId: 'topology',
        pipelineId: 'pipeline-2',
      };

      const enqueued = tryEnqueueBubbleClick();

      expect(enqueued).toBe(true);
      const head = useMentorStore.getState().dialogQueue[0];
      expect(head?.trigger).toBe('subject.generation.started');
      expect(head?.messages[0]?.text).toContain('Topology');
    });

    it('routes to onboarding.pre_first_subject when first subject has not been started', () => {
      activeSubjectStatusRef.value = null;
      useMentorStore.setState({ firstSubjectGenerationEnqueuedAt: null });

      const enqueued = tryEnqueueBubbleClick();

      expect(enqueued).toBe(true);
      const head = useMentorStore.getState().dialogQueue[0];
      expect(head?.trigger).toBe('onboarding.pre_first_subject');
    });

    it('falls back to mentor.bubble.click once first subject has been started and nothing else is active', () => {
      activeSubjectStatusRef.value = null;
      useMentorStore.setState({ firstSubjectGenerationEnqueuedAt: 1_700_000_000 });

      const enqueued = tryEnqueueBubbleClick();

      expect(enqueued).toBe(true);
      const head = useMentorStore.getState().dialogQueue[0];
      expect(head?.trigger).toBe('mentor.bubble.click');
    });
  });
});
