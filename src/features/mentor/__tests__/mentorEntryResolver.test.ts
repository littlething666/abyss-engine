import { describe, expect, it } from 'vitest';

import { resolveMentorEntry } from '../mentorEntryResolver';
import type { MentorEntryContext } from '../mentorEntryResolver';

const baseContext: MentorEntryContext = {
  subjectGraphActiveStage: null,
  subjectGenerationLabel: null,
  playerName: null,
  firstSubjectGenerationEnqueuedAt: null,
  mentorFailureEntry: null,
};

describe('resolveMentorEntry', () => {
  it('prefers mentorFailureEntry when a canonical failure is surfaced', () => {
    const decision = resolveMentorEntry({
      ...baseContext,
      subjectGraphActiveStage: 'topics',
      subjectGenerationLabel: 'Calculus',
      firstSubjectGenerationEnqueuedAt: 1,
      mentorFailureEntry: {
        trigger: 'topic-content:generation-failed',
        payload: {
          subjectId: 's1',
          topicId: 't1',
          topicLabel: 'Limits',
          errorMessage: 'x',
          jobId: 'job-1',
          failureKey: 'cg:job:job-1',
        },
      },
    });
    expect(decision.trigger).toBe('topic-content:generation-failed');
    expect(decision.payload.failureKey).toBe('cg:job:job-1');
  });

  it('prefers subject:generation-started while a subject-graph job is active (topics stage)', () => {
    const decision = resolveMentorEntry({
      ...baseContext,
      subjectGraphActiveStage: 'topics',
      subjectGenerationLabel: 'Linear Algebra',
      firstSubjectGenerationEnqueuedAt: 1,
    });
    expect(decision.trigger).toBe('subject:generation-started');
    expect(decision.payload).toMatchObject({ subjectName: 'Linear Algebra', stage: 'topics' });
  });

  it('prefers subject:generation-started for the edges stage too', () => {
    const decision = resolveMentorEntry({
      ...baseContext,
      subjectGraphActiveStage: 'edges',
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
