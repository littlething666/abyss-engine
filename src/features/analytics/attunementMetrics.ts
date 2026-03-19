import {
  AttunementRitualChecklist,
  AttunementRitualPayload,
  Buff,
  StudySessionAttempt,
} from '../../types/progression';
import { BuffEngine } from '../progression/buffs/buffEngine';

export interface RitualDimensionScores {
  readiness: number;
  biological: number;
  environmental: number;
  intent: number;
  confidence: number;
}

export interface RitualHarmonyResult {
  harmonyScore: number;
  readinessBucket: 'low' | 'medium' | 'high';
  dimensionScores: RitualDimensionScores;
}

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

const MAX_HARMONY_SCORE = 12;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function toBucket(score: number): RitualHarmonyResult['readinessBucket'] {
  if (score >= 9) {
    return 'high';
  }
  if (score >= 6) {
    return 'medium';
  }
  return 'low';
}

export function calculateRitualHarmony(
  checklist: AttunementRitualChecklist,
): RitualHarmonyResult {
  const readiness = checklist.confidenceRating ? clamp01((checklist.confidenceRating - 1) / 4) * 3 : 0;
  const biological = 0 +
    (checklist.sleepHours !== undefined && checklist.sleepHours >= 7 ? 2 : checklist.sleepHours !== undefined && checklist.sleepHours >= 5 ? 1 : 0) +
    (checklist.fuelQuality === 'steady-fuel' ? 1 : 0) +
    (checklist.movementMinutes !== undefined && checklist.movementMinutes >= 5 ? 1 : 0);

  const environmental = 0 +
    (checklist.digitalSilence ? 1 : 0) +
    (checklist.visualClarity ? 1 : 0) +
    (checklist.lightingAndAir ? 1 : 0);

  const intent = 0 +
    (checklist.targetCrystal ? 1 : 0) +
    (checklist.microGoal ? 1 : 0);

  const score = biological + environmental + intent + readiness;
  const normalized = Math.round((score / MAX_HARMONY_SCORE) * 100);

  return {
    harmonyScore: Math.max(0, Math.min(100, normalized)),
    readinessBucket: toBucket(Math.round(score)),
    dimensionScores: {
      readiness,
      biological,
      environmental,
      intent,
      confidence: checklist.confidenceRating ?? 0,
    },
  };
}

export function deriveRitualBuffs(payload: AttunementRitualPayload): Buff[] {
  const checklist = payload.checklist;
  const buffs: Buff[] = [];
  const isBiologicalComplete = checklist.sleepHours !== undefined
    && checklist.movementMinutes !== undefined
    && checklist.fuelQuality !== undefined
    && checklist.hydration !== undefined;
  const isCognitiveComplete = checklist.digitalSilence === true && checklist.visualClarity === true && checklist.lightingAndAir === true;
  const isQuestComplete = checklist.targetCrystal !== undefined
    && checklist.microGoal !== undefined
    && checklist.confidenceRating !== undefined
    && checklist.confidenceRating > 0;

  if (isQuestComplete) {
    buffs.push(BuffEngine.get().grantBuff('clarity_focus_high', 'quest'));
  }
  if (isCognitiveComplete) {
    buffs.push(BuffEngine.get().grantBuff('clarity_focus', 'cognitive'));
  }
  if (isBiologicalComplete) {
    buffs.push(BuffEngine.get().grantBuff('clarity_focus', 'biological'));
  }
  if (isQuestComplete) {
    buffs.push(BuffEngine.get().grantBuff('ritual_growth', 'quest'));
  }

  return buffs;
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
