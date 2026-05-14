import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { strictParse, strictParseArtifact } from './index';

describe('strictParse', () => {
  const schema = z.object({ x: z.string() }).strict();

  it('returns ok on valid JSON+shape', () => {
    const r = strictParse('{"x":"y"}', schema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toEqual({ x: 'y' });
  });

  it('returns parse:json-mode-violation on invalid JSON', () => {
    const r = strictParse('not json', schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('parse:json-mode-violation');
  });

  it('returns parse:json-mode-violation on markdown-fenced JSON (no fence stripping)', () => {
    const r = strictParse('```json\n{"x":"y"}\n```', schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('parse:json-mode-violation');
  });

  it('does NOT extract embedded JSON', () => {
    const r = strictParse('Here is json: {"x":"y"}', schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('parse:json-mode-violation');
  });

  it('returns parse:zod-shape on extra fields', () => {
    const r = strictParse('{"x":"y","extra":1}', schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('parse:zod-shape');
  });

  it('returns parse:zod-shape on wrong type', () => {
    const r = strictParse('{"x":1}', schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('parse:zod-shape');
  });
});

describe('strictParseArtifact', () => {
  it('routes by ArtifactKind (subject-graph-topics)', () => {
    const validTopics = JSON.stringify({
      topics: [
        {
          topicId: 'graph-basics',
          title: 'Graph basics',
          iconName: 'BookOpen',
          tier: 1,
          learningObjective: 'L',
        },
      ],
    });
    const r = strictParseArtifact('subject-graph-topics', validTopics);
    expect(r.ok).toBe(true);
  });

  it('fails for crystal-trial when correctAnswer is not in options', () => {
    const bad = JSON.stringify({
      questions: [
        {
          id: 'q1',
          category: 'interview',
          scenario: 'S',
          question: 'Q',
          options: ['A', 'B'],
          correctAnswer: 'C',
          explanation: 'E',
          sourceCardSummaries: ['s1'],
        },
      ],
    });
    const r = strictParseArtifact('crystal-trial', bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('parse:zod-shape');
  });

  it('rejects mini-game gameType crossover', () => {
    const bad = JSON.stringify({
      cards: [
        {
          id: 'mp-1',
          topicId: 'graph-basics',
          type: 'MINI_GAME',
          content: {
            gameType: 'CATEGORY_SORT',
            pairs: [
              { id: 'p1', left: 'L1', right: 'R1' },
              { id: 'p2', left: 'L2', right: 'R2' },
            ],
          },
          difficulty: 1,
        },
      ],
    });
    const r = strictParseArtifact('topic-mini-game-match-pairs', bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('parse:zod-shape');
  });
});
