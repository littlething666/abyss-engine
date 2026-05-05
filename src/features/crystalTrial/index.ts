export {
  computeTrialGatedStudyReward,
  computeTrialGatedDirectReward,
} from './trialXpGating';
export type { TrialXpGateInput, TrialXpGateResult } from './trialXpGating';
export {
  trialStatusRequiresXpCapAtLevelBoundary,
  busMayStartTrialPregeneration,
  isCrystalTrialPrepared,
  isCrystalTrialAvailableForPlayer,
} from './trialPolicy';
export { useCrystalTrialStore } from './crystalTrialStore';
export { evaluateTrial } from './evaluateTrial';
export {
  TRIAL_QUESTION_COUNT,
  PASS_THRESHOLD,
  COOLDOWN_CARDS_REQUIRED,
  COOLDOWN_MIN_MS,
  MAX_CARD_DIFFICULTY,
} from './crystalTrialConfig';
export type {
  CrystalTrial,
  CrystalTrialResult,
  CrystalTrialScenarioQuestion,
  CrystalTrialStatus,
} from '@/types/crystalTrial';

// Phase 0.5 step 5 — Artifact Appliers
export {
  createCrystalTrialApplier,
  type CrystalTrialApplier,
} from './appliers/crystalTrialApplier';
