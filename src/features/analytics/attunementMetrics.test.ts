import { describe, expect, it } from 'vitest';
import { AttunementPayload } from '../../types/progression';
import { buildSessionMetrics, calculateHarmonyScore, extractAdaptationSignals, generateActiveBuffs } from './attunementMetrics';

const highPayload: AttunementPayload = {
  topicId: 'topic-a',
  checklist: {
    sleepHours: 8,
    ateFuel: true,
    movementMinutes: 30,
    digitalSilence: true,
    visualClarity: true,
    lightingAndAir: true,
    targetCrystal: 'Core',
    microGoal: 'Recall 12 cards',
    confidenceRating: 5,
  },
};

const lowPayload: AttunementPayload = {
  topicId: 'topic-a',
  checklist: {
    sleepHours: 3,
    ateFuel: false,
    movementMinutes: 0,
    confidenceRating: 1,
  },
};

describe('attunement metrics', () => {
  it('computes harmony score and readiness bucket from checklist', () => {
    const high = calculateHarmonyScore(highPayload.checklist);
    const low = calculateHarmonyScore(lowPayload.checklist);

    expect(high.harmonyScore).toBeGreaterThan(low.harmonyScore);
    expect(high.readinessBucket).toBe('high');
    expect(low.readinessBucket).toBe('low');
  });

  it('derives session buffs from attunement payload', () => {
    const buffs = generateActiveBuffs(highPayload);
    expect(buffs.length).toBeGreaterThan(0);
    expect(buffs.some((buff) => buff.modifierType === 'xp_multiplier')).toBe(true);
    expect(buffs.some((buff) => buff.condition.includes('next_') || buff.condition === 'session_end')).toBe(true);
  });

  it('builds session metrics and adaptation signals', () => {
    const metrics = buildSessionMetrics('session-1', 'topic-a', [
      { cardId: 'a-1', rating: 4, difficulty: 3, timestamp: 1, isCorrect: true },
      { cardId: 'a-2', rating: 3, difficulty: 2, timestamp: 2, isCorrect: false },
      { cardId: 'a-3', rating: 3, difficulty: 1, timestamp: 3, isCorrect: true },
      { cardId: 'a-4', rating: 4, difficulty: 2, timestamp: 4, isCorrect: true },
    ], 0);

    expect(metrics.cardsCompleted).toBe(4);
    expect(metrics.avgRating).toBeCloseTo(3.5, 2);
    expect(metrics.correctRate).toBeCloseTo(3 / 4, 5);

    const adaptation = extractAdaptationSignals(metrics);
    expect(adaptation.xpMultiplierHint).toBeGreaterThan(1);
    expect(adaptation.growthSpeedBoost).toBe(1);
    expect(adaptation.clarityBoost).toBe(1.05);
  });
});

