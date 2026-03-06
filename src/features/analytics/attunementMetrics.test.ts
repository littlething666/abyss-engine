import { describe, expect, it } from 'vitest';
import { AttunementPayload } from '../../types/progression';
import { buildSessionMetrics, calculateHarmonyScore, extractAdaptationSignals, generateActiveBuffs } from './attunementMetrics';

const highPayload: AttunementPayload = {
  topicId: 'topic-a',
  checklist: {
    sleepHours: 8,
    fuelQuality: 'steady-fuel',
    hydration: 'optimal',
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
    fuelQuality: 'underfueled',
    hydration: 'dehydrated',
    movementMinutes: 0,
    confidenceRating: 1,
  },
};

const completeBiologicalPayload: AttunementPayload = {
  topicId: 'topic-a',
  checklist: {
    sleepHours: 7,
    fuelQuality: 'sugar-rush',
    hydration: 'moderate',
    movementMinutes: 15,
  },
};

const incompleteBiologicalPayload: AttunementPayload = {
  topicId: 'topic-a',
  checklist: {
    sleepHours: 7,
    fuelQuality: 'steady-fuel',
    movementMinutes: 15,
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
    const buffIds = buffs.map((buff) => buff.buffId);
    expect(buffs.length).toBeGreaterThan(0);
    expect(buffs.some((buff) => buff.modifierType === 'xp_multiplier')).toBe(true);
    expect(buffIds.filter((buffId) => buffId === 'clarity_focus')).toHaveLength(2);
    expect(buffs.some((buff) => buff.buffId === 'clarity_focus' && buff.source === 'cognitive')).toBe(true);
    expect(buffs.some((buff) => buff.buffId === 'clarity_focus' && buff.source === 'biological')).toBe(true);
    expect(buffs.some((buff) => buff.condition === 'session_end')).toBe(true);
  });

  it('grants biological buffs only when biological section is complete', () => {
    const completeBuffs = generateActiveBuffs(completeBiologicalPayload);
    const incompleteBuffs = generateActiveBuffs(incompleteBiologicalPayload);

    const biologicalXpBuffs = completeBuffs.filter((buff) => buff.source === 'biological' && buff.modifierType === 'xp_multiplier');
    expect(biologicalXpBuffs).toHaveLength(1);
    expect(biologicalXpBuffs[0]?.buffId).toBe('clarity_focus');
    expect(incompleteBuffs).toHaveLength(0);
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
