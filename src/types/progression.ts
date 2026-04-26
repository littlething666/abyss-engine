import type { ActiveCrystal, Card, TopicRef } from './core';
import type { SubjectGraph } from './core';

/** Study-ready content state for a topic (IndexedDB + generation jobs). */
export type TopicContentStatus = 'ready' | 'generating' | 'unavailable';

export type BuffModifierType = 'growth_speed' | 'xp_multiplier' | 'clarity_boost' | 'mana_boost';
export type BuffCondition = 'session_end' | 'next_10_cards' | 'next_5_cards' | 'manual';
export type BuffStackingRule = 'multiplicative' | 'additive' | 'max' | 'override';

export interface BuffModifier {
  modifierType: BuffModifierType;
  magnitude: number;
}

export interface Buff {
  buffId: string;
  modifierType: BuffModifierType;
  magnitude: number;
  duration?: number;
  condition: BuffCondition;
  remainingUses?: number;
  maxUses?: number;
  issuedAt?: number;
  source?: string;
  expiresAt?: number;
  instanceId?: string;
  stacks?: number;
  icon?: string;
  name?: string;
  description?: string;
}

export type AttunementReadinessBucket = 'low' | 'medium' | 'high';

export type Rating = 1 | 2 | 3 | 4;
export type CoarseChoice = 'forgot' | 'recalled';
export type CoarseAppliedBucket = 'fast' | 'normal' | 'slow' | 'forgot';

export interface CoarseRatingInputs {
  coarse: CoarseChoice;
  timeTakenMs: number;
  hintUsed: boolean;
  difficulty: number;
}

export interface CoarseRatingResult {
  rating: Rating;
  appliedBucket: CoarseAppliedBucket;
}

export interface CoarseReviewMeta {
  coarseChoice: CoarseChoice;
  hintUsed: boolean;
  appliedBucket: CoarseAppliedBucket;
  timeTakenMs: number;
}

export interface AttunementRitualChecklist {
  sleepHours?: number;
  movementMinutes?: number;
  fuelQuality?: 'underfueled' | 'sugar-rush' | 'steady-fuel' | 'food-coma';
  hydration?: 'dehydrated' | 'moderate' | 'optimal';
  digitalSilence?: boolean;
  visualClarity?: boolean;
  lightingAndAir?: boolean;
  targetCrystal?: string;
  microGoal?: string;
  confidenceRating?: number;
}

export interface AttunementRitualPayload {
  subjectId: string;
  topicId: string;
  checklist: AttunementRitualChecklist;
}

export interface AttunementRitualResult {
  harmonyScore: number;
  readinessBucket: AttunementReadinessBucket;
  buffs: Buff[];
}

export interface StudySessionAttempt {
  /** Same as `cardRefKey` — composite card identity. */
  cardId: string;
  rating: Rating;
  difficulty: number;
  timestamp: number;
  isCorrect: boolean;
  /** Raw coarse-review context for flashcards (optional analytics metadata). */
  coarseChoice?: CoarseChoice;
  hintUsed?: boolean;
  appliedBucket?: CoarseAppliedBucket;
  timeTakenMs?: number;
}

export interface PendingRitualState {
  subjectId: string;
  topicId: string;
  cards: Card[];
  sessionId: string;
}

export interface PendingAttunementState extends PendingRitualState {}

export interface StudySession {
  subjectId: string;
  topicId: string;
  /** Queue of `cardRefKey` strings. */
  queueCardIds: string[];
  /** Current card as `cardRefKey`, aligned with queue. */
  currentCardId: string | null;
  totalCards: number;
  sessionId?: string;
  startedAt?: number;
  lastCardStart?: number;
  activeBuffIds?: string[];
  attempts?: StudySessionAttempt[];
  /** Raw per-file card id → difficulty (session-local). */
  cardDifficultyById?: Record<string, number>;
  cardTypeById?: Record<string, string>;
  /** Raw card id → whether any hint surface was opened before reveal. */
  hintUsedByCardId?: Record<string, boolean>;
}

export interface StudySessionCore extends StudySession {}

export interface StudyUndoSnapshot {
  timestamp: number;
  sm2Data: Record<string, {
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReview: number;
  }>;
  activeCrystals: ActiveCrystal[];
  activeBuffs: Buff[];
  unlockPoints: number;
  /** Account-wide earn-only currency snapshot for undo/redo. */
  resonancePoints: number;
  currentSession: StudySessionCore;
}

export interface ProgressionState {
  activeCrystals: ActiveCrystal[];
  sm2Data: Record<string, {
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReview: number;
  }>;
  unlockPoints: number;
  /** Global earn-only meta-currency (v1: no spend). */
  resonancePoints: number;
  currentSubjectId: string | null;
  currentSession: StudySession | null;
  activeBuffs: Buff[];
  pendingRitual: PendingRitualState | null;
  lastRitualSubmittedAt: number | null;
}

export interface ProgressionActions {
  initialize: () => void;
  setCurrentSubject: (subjectId: string | null) => void;
  startTopicStudySession: (ref: TopicRef, cards: Card[]) => void;
  /** Starts (or restarts) a topic session, then focuses `focusCardId` (raw per-topic card id) when valid. */
  focusStudyCard: (ref: TopicRef, cards: Card[], focusCardId?: string | null) => void;
  openRitualForTopic: (ref: TopicRef, cards: Card[]) => void;
  submitAttunementRitual: (payload: AttunementRitualPayload) => AttunementRitualResult | null;
  getRemainingRitualCooldownMs: (atMs: number) => number;
  clearActiveBuffs: () => void;
  clearPendingRitual: () => void;
  submitStudyResult: (cardRefKey: string, rating: Rating) => void;
  markHintUsed: (cardRefKey: string) => void;
  submitCoarseStudyResult: (cardRefKey: string, coarseChoice: CoarseChoice) => CoarseRatingResult | null;
  advanceStudyAfterReveal: () => void;
  undoLastStudyResult: () => void;
  redoLastStudyResult: () => void;
  unlockTopic: (ref: TopicRef, allGraphs: SubjectGraph[]) => [number, number] | null;
  getTopicUnlockStatus: (ref: TopicRef, allGraphs: SubjectGraph[]) => {
    canUnlock: boolean;
    hasPrerequisites: boolean;
    hasEnoughPoints: boolean;
    unlockPoints: number;
    missingPrerequisites: {
      topicId: string;
      topicName: string;
      requiredLevel: number;
      currentLevel: number;
    }[];
  };
  getTopicTier: (ref: TopicRef, allGraphs: SubjectGraph[]) => number;
  getTopicsByTier: (
    allGraphs: SubjectGraph[],
    subjects: { id: string; name: string }[],
    currentSubjectId?: string | null,
    /** Keyed by `topicRefKey`. Omitted or missing keys → `'unavailable'`. */
    contentStatusByTopicKey?: Record<string, TopicContentStatus>,
  ) => {
    tier: number;
    topics: {
      id: string;
      name: string;
      description: string;
      subjectId: string;
      subjectName: string;
      contentStatus: TopicContentStatus;
      isLocked: boolean;
      isUnlocked: boolean;
      isCurriculumVisible: boolean;
    }[];
  }[];
  getDueCardsCount: (ref: TopicRef, cards?: Array<{ id: string }>) => number;
  getTotalCardsCount: (cards?: Array<{ id: string }>) => number;
  grantBuffFromCatalog: (defId: string, source: string, magnitudeOverride?: number) => void;
  /** If a buff with this defId and source exists, removes it; otherwise grants it from the catalog. */
  toggleBuffFromCatalog: (defId: string, source: string, magnitudeOverride?: number) => void;
  addXP: (ref: TopicRef, xp: number, options?: { sessionId?: string }) => number;
  updateSM2: (ref: TopicRef, rawCardId: string, sm2State: {
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReview: number;
  }) => void;
  getSM2Data: (ref: TopicRef, rawCardId: string) => {
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReview: number;
  } | undefined;
}

export interface ProgressionStore extends ProgressionState, ProgressionActions {}

export const INITIAL_UNLOCK_POINTS = 3;
