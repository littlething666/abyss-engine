import { describe, expect, it, vi } from 'vitest';

import { appEventBus } from '@/infrastructure/eventBus';

import { triggerSubjectGeneration } from './triggerSubjectGeneration';

describe('triggerSubjectGeneration', () => {
  it("emits subject-graph:generation-requested with subjectId and checklist", () => {
    const handler = vi.fn();
    const off = appEventBus.on('subject-graph:generation-requested', handler);

    triggerSubjectGeneration('my-subject', {
      topicName: 'My Topic',
      studyGoal: 'curiosity',
      priorKnowledge: 'beginner',
      learningStyle: 'balanced',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      subjectId: 'my-subject',
      checklist: {
        topicName: 'My Topic',
        studyGoal: 'curiosity',
        priorKnowledge: 'beginner',
        learningStyle: 'balanced',
      },
    });

    off();
  });
});
