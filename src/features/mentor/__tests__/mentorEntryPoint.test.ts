import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tryEnqueueMentorEntry } from '../mentorEntryPoint';
import type { MentorEntryContext } from '../mentorEntryResolver';
import {
  useMentorStore,
  DEFAULT_PERSISTED_STATE,
  DEFAULT_EPHEMERAL_STATE,
} from '../mentorStore';
import { MENTOR_VOICE_ID } from '../mentorVoice';

const baseContext: MentorEntryContext = {
  subjectGenerationPhase: null,
  subjectGenerationLabel: null,
  playerName: null,
  firstSubjectGenerationEnqueuedAt: null,
};

function resetStore(): void {
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
}

describe('tryEnqueueMentorEntry', () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no-ops when the overlay is currently open', () => {
    useMentorStore.setState({
      currentDialog: {
        id: 'plan-x',
        trigger: 'mentor-bubble:clicked',
        priority: 10,
        enqueuedAt: 0,
        messages: [{ id: 'm0', text: 'hi', mood: 'neutral' }],
        source: 'canned',
        voiceId: MENTOR_VOICE_ID,
      },
    });
    const before = useMentorStore.getState().dialogQueue.length;
    const result = tryEnqueueMentorEntry(baseContext);
    expect(result).toBe(false);
    expect(useMentorStore.getState().dialogQueue).toHaveLength(before);
  });

  it('no-ops when the queue is non-empty (queued head wins)', () => {
    useMentorStore.setState({
      dialogQueue: [
        {
          id: 'plan-existing',
          trigger: 'session:completed',
          priority: 50,
          enqueuedAt: 0,
          messages: [{ id: 'm0', text: 'queued', mood: 'neutral' }],
          source: 'canned',
          voiceId: MENTOR_VOICE_ID,
        },
      ],
    });
    const result = tryEnqueueMentorEntry(baseContext);
    expect(result).toBe(false);
    expect(useMentorStore.getState().dialogQueue).toHaveLength(1);
    expect(useMentorStore.getState().dialogQueue[0]?.id).toBe('plan-existing');
  });

  it('appends a plan when overlay closed + queue empty', () => {
    const result = tryEnqueueMentorEntry(baseContext);
    expect(result).toBe(true);
    expect(useMentorStore.getState().dialogQueue.length).toBeGreaterThan(0);
  });
});
