import { describe, expect, it } from 'vitest';

import { parseTopicCardsPayload } from './parseTopicCardsPayload';

describe('parseTopicCardsPayload', () => {
  it('accepts FLASHCARD with question/answer aliases mapped to front/back', () => {
    const raw = `\`\`\`json
{"cards":[{"id":"t-flash-1","type":"FLASHCARD","difficulty":1,"content":{"question":"Q?","answer":"A."}}]}
\`\`\``;
    const r = parseTopicCardsPayload(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cards[0].type).toBe('FLASHCARD');
      expect(r.cards[0].content).toMatchObject({ front: 'Q?', back: 'A.' });
    }
  });

  it('accepts SINGLE_CHOICE with answer alias mapped to correctAnswer', () => {
    const raw = `{"cards":[{"id":"t-sc-1","type":"SINGLE_CHOICE","difficulty":1,"content":{"question":"Q?","options":["a","b","c","d"],"answer":"b","explanation":""}}]}`;
    const r = parseTopicCardsPayload(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cards[0].content).toMatchObject({ correctAnswer: 'b' });
    }
  });

  it('accepts MULTI_CHOICE with answer array alias mapped to correctAnswers', () => {
    const raw = `{"cards":[{"id":"t-mc-1","type":"MULTI_CHOICE","difficulty":1,"content":{"question":"Q?","options":["a","b"],"answer":["a"],"explanation":""}}]}`;
    const r = parseTopicCardsPayload(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cards[0].content).toMatchObject({ correctAnswers: ['a'] });
    }
  });
});
