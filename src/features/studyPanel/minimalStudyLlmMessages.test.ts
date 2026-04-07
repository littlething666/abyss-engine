import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_PERSONALITY } from './agentPersonalityPresets';
import { buildMinimalStudyQuestionMessages } from './minimalStudyLlmMessages';

describe('buildMinimalStudyQuestionMessages', () => {
  it('returns a single system message with topic and question', () => {
    const messages = buildMinimalStudyQuestionMessages(
      'Linear algebra',
      'What is an eigenvector?',
      DEFAULT_AGENT_PERSONALITY,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe('system');
    const content = messages[0]!.content;
    expect(content.length).toBeGreaterThan(20);
    expect(content).toContain('Topic: Linear algebra');
    expect(content).toContain('What is an eigenvector?');
    expect(content).toContain('expert lecturer');
  });

  it('falls back for blank topic and question', () => {
    const content = buildMinimalStudyQuestionMessages('  ', '', DEFAULT_AGENT_PERSONALITY)[0]!.content;
    expect(content).toContain('Unknown topic');
    expect(content).toContain('(empty question)');
  });
});
