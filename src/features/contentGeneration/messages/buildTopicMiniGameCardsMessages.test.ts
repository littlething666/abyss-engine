import { describe, expect, it } from 'vitest';

import { buildTopicMiniGameCardsMessages } from './buildTopicMiniGameCardsMessages';

describe('buildTopicMiniGameCardsMessages', () => {
  it('includes explicit no-unused-category rules for CATEGORY_SORT', () => {
    const messages = buildTopicMiniGameCardsMessages({
      topicId: 'topic-1',
      topicTitle: 'T',
      theory: '## Theory',
      targetDifficulty: 1,
      syllabusQuestions: ['q1'],
      gameType: 'CATEGORY_SORT',
    });
    const system = messages.find((m) => m.role === 'system')?.content;
    expect(typeof system).toBe('string');
    const text = system as string;
    expect(text).toContain('Every category MUST have at least one item');
    expect(text).toContain('Do not create a category unless at least one item');
    expect(text).toContain('exactly **1** card');
  });
});
