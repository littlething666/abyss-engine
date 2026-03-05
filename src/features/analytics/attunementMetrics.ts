import {
  AttunementChecklistSubmission,
  AttunementPayload,
  AttunementReadinessBucket,
  Buff,
  BuffCondition,
  BuffModifierType,
} from '../../types/progression';

export interface AttunementDimensionScores {
  readiness: number;
  biological: number;
  environmental: number;
  intent: number;
  confidence: number;
}

export interface SessionAttempt {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  difficulty: number;
  timestamp: number;
  isCorrect: boolean;
}

export interface SessionMetrics {
  topicId: string;
  sessionId: string;
  sessionDurationMs: number;
  attempts: SessionAttempt[];
  avgDifficulty: number;
  avgRating: number;
  correctRate: number;
  cardsCompleted: number;
}

export interface AdaptationSignals {
  xpMultiplierHint: number;
  growthSpeedBoost: number;
  clarityBoost: number;
}

const MAX_HARMONY_SCORE = 12;
const DEFAULT_SESSION_ID_PREFIX = 'attunement-session';

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function toBucket(score: number): AttunementReadinessBucket {
  if (score >= 9) {
    return 'high';
  }
  if (score >= 6) {
    return 'medium';
  }
  return 'low';
}

export function calculateHarmonyScore(
  checklist: AttunementChecklistSubmission,
): {
  harmonyScore: number;
  readinessBucket: AttunementReadinessBucket;
  dimensionScores: AttunementDimensionScores;
} {
  const readiness = checklist.confidenceRating ? clamp01((checklist.confidenceRating - 1) / 4) * 3 : 0;
  const biological = 0 +
    (checklist.sleepHours !== undefined && checklist.sleepHours >= 7 ? 2 : checklist.sleepHours !== undefined && checklist.sleepHours >= 5 ? 1 : 0) +
    (checklist.ateFuel ? 1 : 0) +
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

function makeBuff(buffId: string, modifierType: BuffModifierType, magnitude: number, condition: BuffCondition, duration?: number): Buff {
  return {
    buffId,
    modifierType,
    magnitude,
    condition,
    duration,
    issuedAt: Date.now(),
  };
}

export function generateActiveBuffs(payload: AttunementPayload): Buff[] {
  const result = calculateHarmonyScore(payload.checklist);
  const buffs: Buff[] = [];
  const confidence = payload.checklist.confidenceRating ?? 3;

  if (result.readinessBucket === 'high' && confidence >= 4) {
    buffs.push(makeBuff('clarity_focus_high', 'clarity_boost', 1.25, 'session_end'));
  }
  if (payload.checklist.digitalSilence && payload.checklist.sleepHours !== undefined && payload.checklist.sleepHours >= 7) {
    buffs.push({
      ...makeBuff('clarity_focus', 'xp_multiplier', 1.15, 'next_10_cards'),
      remainingUses: 10,
    });
  }
  if (result.readinessBucket === 'high' && payload.checklist.ateFuel) {
    buffs.push({
      ...makeBuff('mana_burst', 'xp_multiplier', 1.10, 'next_5_cards'),
      remainingUses: 5,
    });
  }
  if (result.harmonyScore >= 85) {
    buffs.push(makeBuff('ritual_growth', 'growth_speed', 1.15, 'session_end'));
  }

  return buffs;
}

export function buildSessionMetrics(sessionId: string, topicId: string, attempts: SessionAttempt[], sessionStartedAt: number): SessionMetrics {
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

export function extractAdaptationSignals(metrics: SessionMetrics): AdaptationSignals {
  return {
    xpMultiplierHint: metrics.correctRate >= 0.67 ? 1.05 : 1,
    growthSpeedBoost: metrics.correctRate >= 0.8 ? 1.08 : 1,
    clarityBoost: metrics.correctRate >= 0.6 ? 1.05 : 1,
  };
}

export function makeSessionId(topicId: string) {
  return `${DEFAULT_SESSION_ID_PREFIX}-${topicId}-${Date.now()}`;
}

