import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  useMentorStore,
} from '../mentorStore';
import {
  tryEnqueueMentorEntry,
  type MentorEntryContext,
} from '../mentorEntryPoint';
import type { DialogPlan } from '../mentorTypes';
import type { ActiveSubjectGenerationStatus } from '@/features/contentGeneration/activeSubjectGenerationStatus';

function ctx(overrides: Partial<MentorEntryContext> = {}): MentorEntryContext {
  return {
    subjectGenerationStatus: null,
    playerName: null,
    firstSubjectGenerationEnqueuedAt: 1_700_000_000,
    ...overrides,
  };
}

function activeStatus(
  overrides: Partial<ActiveSubjectGenerationStatus> = {},
): ActiveSubjectGenerationStatus {
  return {
    phase: 'topics',
    status: 'streaming',
    label: 'New subject: Topology',
    subjectId: 'topology',
    pipelineId: 'pipeline-1',
    ...overrides,
  } as ActiveSubjectGenerationStatus;
}

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

describe('tryEnqueueMentorEntry — guards', () => {
  it('is a no-op when the overlay is already open', () => {
    useMentorStore.setState({ currentDialog: stubPlan(1) });
    const enqueued = tryEnqueueMentorEntry(ctx());
    expect(enqueued).toBe(false);
    expect(useMentorStore.getState().dialogQueue).toHaveLength(0);
  });

  it('is a no-op when the queue is non-empty', () => {
    useMentorStore.setState({ dialogQueue: [stubPlan(2)] });
    const enqueued = tryEnqueueMentorEntry(ctx());
    expect(enqueued).toBe(false);
    expect(useMentorStore.getState().dialogQueue).toHaveLength(1);
    expect(useMentorStore.getState().dialogQueue[0]?.id).toBe('stub-2');
  });
});

describe('tryEnqueueMentorEntry — resolver priority', () => {
  it('1. failed subject generation wins over everything else', () => {
    const enqueued = tryEnqueueMentorEntry(
      ctx({
        subjectGenerationStatus: activeStatus({
          phase: 'failed',
          status: 'failed',
          label: 'New subject: Calculus',
        } as Partial<ActiveSubjectGenerationStatus>),
        firstSubjectGenerationEnqueuedAt: null,
      }),
    );
    expect(enqueued).toBe(true);
    const head = useMentorStore.getState().dialogQueue[0];
    expect(head?.trigger).toBe('subject.generation.failed');
    expect(head?.messages[0]?.text).toContain('Calculus');
  });

  it('2a. topics-phase generation routes to subject.generation.started with topics stage', () => {
    const enqueued = tryEnqueueMentorEntry(
      ctx({
        subjectGenerationStatus: activeStatus({ phase: 'topics' } as Partial<ActiveSubjectGenerationStatus>),
      }),
    );
    expect(enqueued).toBe(true);
    const head = useMentorStore.getState().dialogQueue[0];
    expect(head?.trigger).toBe('subject.generation.started');
    expect(head?.messages[0]?.text).toContain('Topology');
    expect(
      /(stage one|topic outline|topic lattice|topic generation)/i.test(
        head?.messages[0]?.text ?? '',
      ),
    ).toBe(true);
  });

  it('2b. edges-phase generation routes to subject.generation.started with edges stage', () => {
    const enqueued = tryEnqueueMentorEntry(
      ctx({
        subjectGenerationStatus: activeStatus({ phase: 'edges' } as Partial<ActiveSubjectGenerationStatus>),
      }),
    );
    expect(enqueued).toBe(true);
    const head = useMentorStore.getState().dialogQueue[0];
    expect(head?.trigger).toBe('subject.generation.started');
    expect(
      /(stage two|edges|prerequisites|dependencies)/i.test(
        head?.messages[0]?.text ?? '',
      ),
    ).toBe(true);
  });

  it('3. pre-first-subject onboarding when no generation is active and gate is open', () => {
    const enqueued = tryEnqueueMentorEntry(
      ctx({
        subjectGenerationStatus: null,
        firstSubjectGenerationEnqueuedAt: null,
      }),
    );
    expect(enqueued).toBe(true);
    const head = useMentorStore.getState().dialogQueue[0];
    expect(head?.trigger).toBe('onboarding.pre_first_subject');
  });

  it('3b. pre-first-subject onboarding still re-surfaces after a previous dismiss (no oneShot)', () => {
    useMentorStore.setState({
      seenTriggers: ['onboarding.pre_first_subject'],
      firstSubjectGenerationEnqueuedAt: null,
    });
    const enqueued = tryEnqueueMentorEntry(
      ctx({
        subjectGenerationStatus: null,
        firstSubjectGenerationEnqueuedAt: null,
      }),
    );
    expect(enqueued).toBe(true);
    const head = useMentorStore.getState().dialogQueue[0];
    expect(head?.trigger).toBe('onboarding.pre_first_subject');
  });

  it('4. fallback to mentor.bubble.click when first subject has been started and nothing else is active', () => {
    const enqueued = tryEnqueueMentorEntry(
      ctx({
        subjectGenerationStatus: null,
        firstSubjectGenerationEnqueuedAt: 1_700_000_000,
      }),
    );
    expect(enqueued).toBe(true);
    const head = useMentorStore.getState().dialogQueue[0];
    expect(head?.trigger).toBe('mentor.bubble.click');
  });
});
