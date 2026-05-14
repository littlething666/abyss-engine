import { describe, expect, it } from 'vitest';

import { buildStudyLlmMessages } from './studyLlmPrompts';
import { resolveStudyLlmPolicy } from './studyLlmPolicy';

describe('buildStudyLlmMessages', () => {
  it('builds backend-owned question explanation prompt messages', () => {
    const messages = buildStudyLlmMessages(
      {
        kind: 'study-question-explain',
        intent: {
          topicLabel: 'Vectors',
          questionText: 'What is a dot product?',
          agentPersonality: 'Use crisp explanations.',
        },
      },
      resolveStudyLlmPolicy('study-question-explain'),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'system' });
    expect(messages[0].content).toContain('Use crisp explanations.');
    expect(messages[0].content).toContain('Topic: Vectors');
    expect(messages[0].content).toContain('What is a dot product?');
    expect(messages[0].content).toContain('Prompt version: study-question-explain.v1');
  });

  it('builds backend-owned formula explanation prompt messages', () => {
    const messages = buildStudyLlmMessages(
      {
        kind: 'study-formula-explain',
        intent: {
          topicLabel: 'Mechanics',
          cardQuestionText: 'Compute kinetic energy.',
          latex: 'E_k=\\frac{1}{2}mv^2',
          context: 'answer',
        },
      },
      resolveStudyLlmPolicy('study-formula-explain'),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'system' });
    expect(messages[0].content).toContain('The formula appears on the revealed answer side of the card.');
    expect(messages[0].content).toContain('E_k=\\frac{1}{2}mv^2');
    expect(messages[0].content).toContain('Prompt version: study-formula-explain.v1');
  });
});
