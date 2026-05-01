import { describe, expect, it } from 'vitest';

import { parseTopicTheoryContentPayload } from './parseTopicTheoryContentPayload';

const validPayload = {
  coreConcept: 'Core idea.',
  theory: '# Title\n\nBody with enough content.',
  keyTakeaways: ['a', 'b', 'c', 'd'],
  coreQuestionsByDifficulty: {
    1: ['q1'],
    2: ['q2'],
    3: ['q3'],
    4: ['q4'],
  },
};

describe('parseTopicTheoryContentPayload', () => {
  it('accepts a valid theory-only payload', () => {
    const result = parseTopicTheoryContentPayload(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.coreConcept).toBe('Core idea.');
    expect(result.data.coreQuestionsByDifficulty[4]).toEqual(['q4']);
    expect(result.data.groundingSources).toEqual([]);
  });

  it('rejects when coreQuestionsByDifficulty.4 is missing', () => {
    const bad = {
      ...validPayload,
      coreQuestionsByDifficulty: {
        1: ['q1'],
        2: ['q2'],
        3: ['q3'],
      },
    };
    const result = parseTopicTheoryContentPayload(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/coreQuestionsByDifficulty/i);
  });

  it('rejects malformed JSON', () => {
    const result = parseTopicTheoryContentPayload('{"a": }');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/valid JSON/i);
  });

  it('rejects unknown top-level keys (strict object)', () => {
    const withExtra = { ...validPayload, miniGameAffordances: { categorySets: [] } };
    const result = parseTopicTheoryContentPayload(JSON.stringify(withExtra));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Unrecognized key|miniGameAffordances/i);
  });
});
