import { describe, it, expect } from 'vitest';

import type { CrystalTrialScenarioQuestion } from '@/types/crystalTrial';
import { evaluateTrial } from './evaluateTrial';

const makeQuestion = (id: string, correctAnswer: string): CrystalTrialScenarioQuestion => ({
  id,
  category: 'interview',
  scenario: `Scenario for ${id}`,
  question: `Question for ${id}?`,
  options: ['A', 'B', 'C', correctAnswer],
  correctAnswer,
  explanation: `Explanation for ${id}`,
  sourceCardSummaries: ['concept-1', 'concept-2'],
});

describe('evaluateTrial', () => {
  const questions: CrystalTrialScenarioQuestion[] = [
    makeQuestion('q1', 'Alpha'),
    makeQuestion('q2', 'Beta'),
    makeQuestion('q3', 'Gamma'),
    makeQuestion('q4', 'Delta'),
    makeQuestion('q5', 'Epsilon'),
  ];

  it('passes when score >= threshold', () => {
    const answers: Record<string, string> = {
      q1: 'Alpha',
      q2: 'Beta',
      q3: 'Gamma',
      q4: 'Delta',
      q5: 'wrong',
    };
    const result = evaluateTrial(questions, answers, 0.8);
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(4);
    expect(result.score).toBe(0.8);
    expect(result.totalQuestions).toBe(5);
  });

  it('fails when score < threshold', () => {
    const answers: Record<string, string> = {
      q1: 'Alpha',
      q2: 'wrong',
      q3: 'wrong',
      q4: 'Delta',
      q5: 'wrong',
    };
    const result = evaluateTrial(questions, answers, 0.8);
    expect(result.passed).toBe(false);
    expect(result.correctCount).toBe(2);
    expect(result.score).toBe(0.4);
  });

  it('is case-insensitive', () => {
    const answers: Record<string, string> = {
      q1: 'alpha',
      q2: 'BETA',
      q3: ' Gamma ',
      q4: 'delta',
      q5: 'epsilon',
    };
    const result = evaluateTrial(questions, answers, 0.8);
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(5);
  });

  it('treats missing answers as incorrect', () => {
    const result = evaluateTrial(questions, {}, 0.8);
    expect(result.passed).toBe(false);
    expect(result.correctCount).toBe(0);
    expect(result.score).toBe(0);
  });

  it('handles empty questions array', () => {
    const result = evaluateTrial([], {}, 0.8);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.totalQuestions).toBe(0);
  });

  it('includes per-question breakdown', () => {
    const answers: Record<string, string> = {
      q1: 'Alpha',
      q2: 'wrong',
    };
    const subset = questions.slice(0, 2);
    const result = evaluateTrial(subset, answers, 0.5);
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[0].isCorrect).toBe(true);
    expect(result.breakdown[0].explanation).toBe('Explanation for q1');
    expect(result.breakdown[1].isCorrect).toBe(false);
    expect(result.breakdown[1].playerAnswer).toBe('wrong');
  });
});
