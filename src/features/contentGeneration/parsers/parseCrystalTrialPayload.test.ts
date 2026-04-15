import { describe, it, expect } from 'vitest';

import { TRIAL_QUESTION_COUNT } from '@/features/crystalTrial/crystalTrialConfig';

import { parseCrystalTrialPayload } from './parseCrystalTrialPayload';

const validQuestion = {
  id: 'trial-q1',
  category: 'interview',
  scenario: 'In a senior dev interview, you are asked about BST performance.',
  question: 'Which approach is best for prefix search?',
  options: ['Array scan', 'BST in-order', 'Hash map', 'Linked list'],
  correctAnswer: 'BST in-order',
  explanation: 'BST ordering clusters prefixed keys in a subtree.',
  sourceCardSummaries: ['BST ordering property', 'In-order traversal'],
};

function fiveQuestions(): typeof validQuestion[] {
  return Array.from({ length: TRIAL_QUESTION_COUNT }, (_, i) => ({
    ...validQuestion,
    id: `trial-q${i + 1}`,
  }));
}

const validPayload = JSON.stringify({ questions: fiveQuestions() });

describe('parseCrystalTrialPayload', () => {
  it('parses valid payload', () => {
    const result = parseCrystalTrialPayload(validPayload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions).toHaveLength(TRIAL_QUESTION_COUNT);
      expect(result.questions[0].id).toBe('trial-q1');
      expect(result.questions[0].category).toBe('interview');
    }
  });

  it('handles markdown code fences', () => {
    const wrapped = '```json\n' + validPayload + '\n```';
    const result = parseCrystalTrialPayload(wrapped);
    expect(result.ok).toBe(true);
  });

  it('rejects invalid JSON', () => {
    const result = parseCrystalTrialPayload('not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('JSON parse error');
    }
  });

  it('rejects missing questions array', () => {
    const result = parseCrystalTrialPayload(JSON.stringify({ data: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Expected');
    }
  });

  it('rejects empty questions array', () => {
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('empty');
    }
  });

  it('rejects when question count is not exactly TRIAL_QUESTION_COUNT', () => {
    const oneShort = fiveQuestions().slice(0, TRIAL_QUESTION_COUNT - 1);
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: oneShort }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(String(TRIAL_QUESTION_COUNT));
    }
  });

  it('rejects question with missing id', () => {
    const qs = fiveQuestions();
    qs[0] = { ...qs[0], id: '' };
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: qs }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('"id"');
    }
  });

  it('rejects question with missing scenario', () => {
    const qs = fiveQuestions();
    qs[0] = { ...qs[0], scenario: '' };
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: qs }));
    expect(result.ok).toBe(false);
  });

  it('rejects question with too few options', () => {
    const qs = fiveQuestions();
    qs[0] = { ...qs[0], options: ['only one'] };
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: qs }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('options');
    }
  });

  it('rejects question where correctAnswer does not match any option', () => {
    const qs = fiveQuestions();
    qs[0] = { ...qs[0], correctAnswer: 'Not in options' };
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: qs }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('correctAnswer');
    }
  });

  it('rejects question with empty sourceCardSummaries', () => {
    const qs = fiveQuestions();
    qs[0] = { ...qs[0], sourceCardSummaries: [] };
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: qs }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('sourceCardSummaries');
    }
  });

  it('parses multiple valid questions with distinct categories', () => {
    const qs = fiveQuestions();
    qs[1] = { ...qs[1], category: 'troubleshooting' };
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: qs }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions).toHaveLength(TRIAL_QUESTION_COUNT);
      expect(result.questions[1].category).toBe('troubleshooting');
    }
  });

  it('correctAnswer matching is case-insensitive', () => {
    const qs = fiveQuestions();
    qs[0] = { ...qs[0], correctAnswer: 'bst in-order' };
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: qs }));
    expect(result.ok).toBe(true);
  });

  it('defaults missing category to interview', () => {
    const qs = fiveQuestions();
    const { category: _, ...qNoCategory } = qs[0];
    qs[0] = qNoCategory as typeof validQuestion;
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: qs }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions[0].category).toBe('interview');
    }
  });

  it('defaults invalid category to interview', () => {
    const qs = fiveQuestions();
    qs[0] = { ...qs[0], category: 'unknown_cat' };
    const result = parseCrystalTrialPayload(JSON.stringify({ questions: qs }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions[0].category).toBe('interview');
    }
  });
});
