export type CrystalTrialStatus =
  | 'idle'
  | 'pregeneration'
  | 'awaiting_player'
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'cooldown';

export type TrialQuestionCategory = 'interview' | 'troubleshooting' | 'architecture';

export interface CrystalTrialScenarioQuestion {
  id: string;
  /** Scenario category assigned by the LLM */
  category: TrialQuestionCategory;
  /** Real-world situation requiring application of topic knowledge */
  scenario: string;
  /** The specific question about the scenario */
  question: string;
  /** 4 answer options */
  options: string[];
  /** The correct option (must match one of options exactly) */
  correctAnswer: string;
  /** Explanation tracing back to the source card concepts */
  explanation: string;
  /** Summaries of card concepts combined in this question (2-3 per question) */
  sourceCardSummaries: string[];
}

/**
 * Browser-owned Crystal Trial attempt state.
 *
 * Generated question content and card-pool hashes are backend Learning Content
 * Store reads. The browser store tracks only attempt/cooldown/progression
 * state and receives question sets transiently from backend query consumers
 * when evaluating an attempt.
 */
export interface CrystalTrialAttempt {
  trialId: string;
  subjectId: string;
  topicId: string;
  /** The level the player is trying to reach (currentLevel + 1) */
  targetLevel: number;
  status: CrystalTrialStatus;
  /** questionId → selected option text */
  answers: Record<string, string>;
  /** Percentage score after submission (0–1), null until evaluated */
  score: number | null;
  passThreshold: number;
  createdAt: number;
  completedAt: number | null;
}

/**
 * Legacy full trial shape retained for import compatibility and read-model
 * boundaries that still model questions inline. Runtime browser state should
 * use {@link CrystalTrialAttempt} instead.
 */
export interface CrystalTrial extends CrystalTrialAttempt {
  questions: CrystalTrialScenarioQuestion[];
  /** Hash of card IDs used for generation — backend-owned validity marker */
  cardPoolHash: string | null;
}

export interface CrystalTrialResult {
  passed: boolean;
  score: number;
  totalQuestions: number;
  correctCount: number;
  /** Per-question breakdown for review */
  breakdown: Array<{
    questionId: string;
    playerAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation: string;
  }>;
}
