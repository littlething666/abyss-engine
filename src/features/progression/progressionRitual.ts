import {
  AttunementRitualChecklist,
  AttunementRitualPayload,
  Buff,
} from '../../types/progression';
import { BuffEngine } from './buffs/buffEngine';

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
