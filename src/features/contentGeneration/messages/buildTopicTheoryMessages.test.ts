import { describe, expect, it } from 'vitest';

import { buildTopicTheoryMessages } from './buildTopicTheoryMessages';

describe('buildTopicTheoryMessages', () => {
  it('embeds hardened mini-game affordance rules in the system prompt', () => {
    const messages = buildTopicTheoryMessages({
      subjectTitle: 'S',
      topicId: 't1',
      topicTitle: 'T',
      learningObjective: 'Learn.',
    });
    const system = messages.find((m) => m.role === 'system')?.content;
    expect(typeof system).toBe('string');
    const text = system as string;

    expect(text).toContain('exactly 1 valid set per mini-game type');
    expect(text).toContain('at least 3 categories');
    expect(text).toContain('at least 6 items');
    expect(text).toContain('two-category');
    expect(text).toContain('Normal Form');
    expect(text).toContain('Extensive Form');
  });
});
