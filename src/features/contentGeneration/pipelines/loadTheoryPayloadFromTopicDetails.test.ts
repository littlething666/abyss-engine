import { describe, expect, it } from 'vitest';

import type { TopicDetails } from '@/types/core';

import { loadTheoryPayloadFromTopicDetails } from './loadTheoryPayloadFromTopicDetails';

describe('loadTheoryPayloadFromTopicDetails', () => {
  it('returns payload when syllabus 1-4 is present', () => {
    const d: TopicDetails = {
      topicId: 't',
      title: 'T',
      subjectId: 's',
      coreConcept: 'cc',
      theory: 'body',
      keyTakeaways: ['a', 'b', 'c', 'd'],
      coreQuestionsByDifficulty: {
        1: ['q1'],
        2: ['q2'],
        3: ['q3'],
        4: ['q4'],
      },
    };
    const out = loadTheoryPayloadFromTopicDetails(d);
    expect(out.theory).toBe('body');
    expect(out.coreQuestionsByDifficulty[1]).toEqual(['q1']);
    expect(out.coreQuestionsByDifficulty[4]).toEqual(['q4']);
  });

  it('throws when theory is empty', () => {
    const d: TopicDetails = {
      topicId: 't',
      title: 'T',
      subjectId: 's',
      coreConcept: '',
      theory: '   ',
      keyTakeaways: [],
    };
    expect(() => loadTheoryPayloadFromTopicDetails(d)).toThrow(/theory is missing/i);
  });
});
