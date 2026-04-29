import { describe, expect, it } from 'vitest';

import { resolveMentorEntry } from '../mentorEntryResolver';
import type { MentorEntryContext } from '../mentorEntryResolver';

const baseContext: MentorEntryContext = {
  subjectGenerationPhase: null,
  subjectGenerationLabel: null,
  playerName: null,
  firstSubjectGenerationEnqueuedAt: null,
};

describe('resolveMentorEntry', () => {
  it('prefers subject:generation-failed when an active generation has failed', () => {
    const decision = resolveMentorEntry({
      ...baseContext,
      subjectGenerationPhase: 'failed',
      subjectGenerationLabel: 'Topology',
      firstSubjectGenerationEnqueuedAt: 1,
    });
    expect(decision.trigger).toBe('subject:generation-failed');
    expect(decision.payload).toMatchObject({ subjectName: 'Topology' });
  });

  it('prefers subject:generation-started while a generation is active (topics stage)', () => {
    const decision = resolveMentorEntry({
      ...baseContext,
      subjectGenerationPhase: 'topics',
      subjectGenerationLabel: 'Linear Algebra',
      firstSubjectGenerationEnqueuedAt: 1,
    });
    expect(decision.trigger).toBe('subject:generation-started');
    expect(decision.payload).toMatchObject({ subjectName: 'Linear Algebra', stage: 'topics' });
  });

  it('prefers subject:generation-started for the edges stage too', () => {
    const decision = resolveMentorEntry({
      ...baseContext,
      subjectGenerationPhase: 'edges',
      subjectGenerationLabel: 'Graphs',
      firstSubjectGenerationEnqueuedAt: 1,
    });
    expect(decision.trigger).toBe('subject:generation-started');
    expect(decision.payload).toMatchObject({ stage: 'edges' });
  });

  it('selects onboarding:pre-first-subject when no subject has been generated yet', () => {
    const decision = resolveMentorEntry(baseContext);
    expect(decision.trigger).toBe('onboarding:pre-first-subject');
  });

  it('falls back to mentor-bubble:clicked after the first subject has been enqueued', () => {
    const decision = resolveMentorEntry({
      ...baseContext,
      firstSubjectGenerationEnqueuedAt: 1234,
    });
    expect(decision.trigger).toBe('mentor-bubble:clicked');
  });

  it('still resolves pre-first-subject even if a player name is set, as long as no subject has been enqueued', () => {
    const decision = resolveMentorEntry({
      ...baseContext,
      playerName: 'Sergio',
    });
    expect(decision.trigger).toBe('onboarding:pre-first-subject');
  });
});
