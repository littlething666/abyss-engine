import { describe, expect, it } from 'vitest';
import {
  buildTopicTheorySourceSpans,
  formatTheorySourceSpansForPrompt,
  selectRelevantTheorySourceSpans,
} from './theorySourceSpans';

describe('topic theory source spans', () => {
  const payload = {
    coreConcept: 'Limits describe approach behavior.',
    theory: [
      'A limit describes what a function approaches near an input, not necessarily the value at that input.',
      'One-sided limits compare approach behavior from the left and from the right.',
      'Continuity requires the limit and function value to agree.',
    ].join('\n\n'),
    keyTakeaways: ['Limits can exist even when a function is undefined at the point.'],
    coreQuestionsByDifficulty: {
      '1': ['What does a limit describe?'],
      '2': ['How do left and right limits determine a two-sided limit?'],
    },
  };

  it('extracts deterministic backend-owned source spans from topic theory artifacts', async () => {
    const first = await buildTopicTheorySourceSpans({ subjectId: 'math', topicId: 'limits', payload });
    const second = await buildTopicTheorySourceSpans({ subjectId: 'math', topicId: 'limits', payload });

    expect(first.map((span) => span.spanId)).toEqual(second.map((span) => span.spanId));
    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'core-concept', spanId: expect.stringMatching(/^theory_span_[0-9a-f]{64}$/) }),
      expect.objectContaining({ kind: 'theory', text: expect.stringContaining('One-sided limits') }),
      expect.objectContaining({ kind: 'key-takeaway' }),
      expect.objectContaining({ kind: 'syllabus-question', difficulty: 2 }),
    ]));
  });

  it('selects a bounded relevant subset for downstream card prompts', async () => {
    const spans = await buildTopicTheorySourceSpans({ subjectId: 'math', topicId: 'limits', payload });
    const selected = selectRelevantTheorySourceSpans({
      spans,
      queries: ['How do left and right limits determine a two-sided limit?'],
      maxChars: 260,
    });

    expect(selected.length).toBeGreaterThan(0);
    expect(selected.some((span) => span.text.includes('left and from the right'))).toBe(true);
    expect(formatTheorySourceSpansForPrompt(selected)).toContain('theory_span_');
  });
});
