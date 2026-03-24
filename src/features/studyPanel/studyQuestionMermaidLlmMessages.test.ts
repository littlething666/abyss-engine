import { describe, expect, it } from 'vitest';

import { buildStudyQuestionMermaidMessages } from './studyQuestionMermaidLlmMessages';

describe('buildStudyQuestionMermaidMessages', () => {
  it('returns a single system message with topic and question', () => {
    const messages = buildStudyQuestionMermaidMessages('Linear algebra', 'What is an eigenvector?');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe('system');
    const content = messages[0]!.content;
    expect(typeof content).toBe('string');
    if (typeof content !== 'string') {
      return;
    }
    expect(content.length).toBeGreaterThan(20);
    expect(content).toContain('Topic: Linear algebra');
    expect(content).toContain('What is an eigenvector?');
    expect(content.toLowerCase()).toContain('mermaid');
  });

  it('falls back for blank topic and question', () => {
    const raw = buildStudyQuestionMermaidMessages('  ', '')[0]!.content;
    expect(typeof raw).toBe('string');
    if (typeof raw !== 'string') {
      return;
    }
    expect(raw).toContain('Unknown topic');
    expect(raw).toContain('(empty question)');
  });
});
