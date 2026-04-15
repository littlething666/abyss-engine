import type {
  CrystalTrial,
  CrystalTrialResult,
  CrystalTrialScenarioQuestion,
} from '@/types/crystalTrial';

/**
 * Pure function: evaluates a completed trial.
 * Compares player answers against correct answers and produces a result.
 */
export function evaluateTrial(
  questions: CrystalTrialScenarioQuestion[],
  answers: Record<string, string>,
  passThreshold: number,
): CrystalTrialResult {
  const breakdown = questions.map((q) => {
    const playerAnswer = answers[q.id] ?? '';
    const isCorrect =
      playerAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
    return {
      questionId: q.id,
      playerAnswer,
      correctAnswer: q.correctAnswer,
      isCorrect,
      explanation: q.explanation,
    };
  });

  const correctCount = breakdown.filter((b) => b.isCorrect).length;
  const totalQuestions = questions.length;
  const score = totalQuestions > 0 ? correctCount / totalQuestions : 0;
  const passed = score >= passThreshold;

  return {
    passed,
    score,
    totalQuestions,
    correctCount,
    breakdown,
  };
}
