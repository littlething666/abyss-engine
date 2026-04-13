import { StudySessionAttempt } from '../../types/progression';

export interface StudySessionTelemetryMetrics {
  topicId: string;
  sessionId: string;
  sessionDurationMs: number;
  attempts: StudySessionAttempt[];
  avgDifficulty: number;
  avgRating: number;
  correctRate: number;
  cardsCompleted: number;
}

export interface StudyAdaptationSignals {
  xpMultiplierHint: number;
  growthSpeedBoost: number;
  clarityBoost: number;
}

export function buildStudySessionMetrics(
  sessionId: string,
  topicId: string,
  attempts: StudySessionAttempt[],
  sessionStartedAt: number,
): StudySessionTelemetryMetrics {
  const cardsCompleted = attempts.length;
  const avgDifficulty = cardsCompleted === 0
    ? 0
    : attempts.reduce((sum, attempt) => sum + attempt.difficulty, 0) / cardsCompleted;
  const avgRating = cardsCompleted === 0
    ? 0
    : attempts.reduce((sum, attempt) => sum + attempt.rating, 0) / cardsCompleted;
  const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
  const correctRate = cardsCompleted === 0 ? 0 : correctCount / cardsCompleted;

  return {
    topicId,
    sessionId,
    sessionDurationMs: Date.now() - sessionStartedAt,
    attempts,
    avgDifficulty,
    avgRating,
    correctRate,
    cardsCompleted,
  };
}

export function extractStudyAdaptationSignals(metrics: StudySessionTelemetryMetrics): StudyAdaptationSignals {
  return {
    xpMultiplierHint: metrics.correctRate >= 0.67 ? 1.05 : 1,
    growthSpeedBoost: metrics.correctRate >= 0.8 ? 1.08 : 1,
    clarityBoost: metrics.correctRate >= 0.6 ? 1.05 : 1,
  };
}

const RITUAL_SESSION_ID_PREFIX = 'attunement-session';
const STUDY_SESSION_ID_PREFIX = 'study-session';

export function makeRitualSessionId(topicId: string) {
  return `${RITUAL_SESSION_ID_PREFIX}-${topicId}-${Date.now()}`;
}

export function makeStudySessionId(topicId: string) {
  return `${STUDY_SESSION_ID_PREFIX}-${topicId}-${Date.now()}`;
}
