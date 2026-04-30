import { describe, expect, it } from 'vitest';

import { parseGraphResponse } from './parseGraphResponse';

describe('parseGraphResponse', () => {
  const minimalValid = {
    subjectId: 'test-subject',
    title: 'Test',
    themeId: 'test-subject',
    maxTier: 1,
    nodes: [
      {
        topicId: 'only-topic',
        title: 'Only',
        tier: 1,
        prerequisites: [],
        learningObjective: 'Learn the thing.',
        iconName: 'lightbulb',
      },
    ],
  };

  it('parses minimal valid graph', () => {
    const result = parseGraphResponse(JSON.stringify(minimalValid));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.subjectId).toBe('test-subject');
      expect(result.graph.nodes).toHaveLength(1);
    }
  });

  it('parses fenced response', () => {
    const wrapped = `\`\`\`json\n${JSON.stringify(minimalValid)}\n\`\`\``;
    const result = parseGraphResponse(wrapped);
    expect(result.ok).toBe(true);
  });

  it('fails on invalid JSON', () => {
    const result = parseGraphResponse('{');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('JSON');
    }
  });

  it('fails on wrong shape', () => {
    const result = parseGraphResponse('{"foo":1}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('schema');
    }
  });
});
