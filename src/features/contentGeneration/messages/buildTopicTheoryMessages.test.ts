import { describe, expect, it } from 'vitest';

import { buildTopicTheoryMessages } from './buildTopicTheoryMessages';

describe('buildTopicTheoryMessages', () => {
  it('embeds theory-only JSON shape without mini-game affordance scaffolding', () => {
    const messages = buildTopicTheoryMessages({
      subjectTitle: 'S',
      topicId: 't1',
      topicTitle: 'T',
      learningObjective: 'Learn.',
    });
    const system = messages.find((m) => m.role === 'system')?.content;
    expect(typeof system).toBe('string');
    const text = system as string;

    expect(text).toContain('"coreConcept"');
    expect(text).toContain('"coreQuestionsByDifficulty"');
    expect(text).not.toContain('miniGameAffordances');
    expect(text).not.toContain('category-sort cardinality');
    expect(text).toContain('ASCII-only JSON string content');
  });
});
