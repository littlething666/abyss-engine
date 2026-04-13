import type { ActiveCrystal, Card } from './core';
import type { SubjectGraph } from './core';
import type { SubjectTopicRef, TopicRefKey } from '../lib/topicRef';

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

export interface AttunementRitualPayload extends SubjectTopicRef {
  checklist: AttunementRitualChecklist;
}

export interface AttunementRitualResult {
  harmonyScore: number;
  readinessBucket: AttunementReadinessBucket;
  buffs: Buff[];
}

export interface StudySessionAttempt {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  difficulty: number;
  timestamp: number;
  isCorrect: boolean;
}

export interface PendingRitualState extends SubjectTopicRef {
  cards: Card[];
  sessionId: string;
}

export interface PendingAttunementState extends PendingRitualState {}

export type Rating = 1 | 2 | 3 | 4;

export interface StudySession extends SubjectTopicRef {
  queueCardIds: string[];
  currentCardId: string | null;
  totalCards: number;
  sessionId?: string;
  startedAt?: number;
  lastCardStart?: number;
  activeBuffIds?: string[];
  attempts?: StudySessionAttempt[];
  cardDifficultyById?: Record<string, number>;
  cardTypeById?: Record<string, string>;
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
  currentSubjectId: string | null;
  currentSession: StudySession | null;
  activeBuffs: Buff[];
  pendingRitual: PendingRitualState | null;
  lastRitualSubmittedAt: number | null;
}

export interface ProgressionActions {
  initialize: () => void;
  setCurrentSubject: (subjectId: string | null) => void;
  startTopicStudySession: (ref: SubjectTopicRef, cards: Card[]) => void;
  /** Starts (or restarts) a topic session, then focuses `focusCardId` when present and valid. */
  focusStudyCard: (ref: SubjectTopicRef, cards: Card[], focusCardId?: string | null) => void;
  openRitualForTopic: (ref: SubjectTopicRef, cards: Card[]) => void;
  submitAttunementRitual: (payload: AttunementRitualPayload) => AttunementRitualResult | null;
  getRemainingRitualCooldownMs: (atMs: number) => number;
  clearActiveBuffs: () => void;
  clearPendingRitual: () => void;
  submitStudyResult: (cardId: string, rating: Rating) => void;
  undoLastStudyResult: () => void;
  redoLastStudyResult: () => void;
  unlockTopic: (ref: SubjectTopicRef, allGraphs: SubjectGraph[]) => [number, number] | null;
  getTopicUnlockStatus: (ref: SubjectTopicRef, allGraphs: SubjectGraph[]) => {
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
  getTopicTier: (ref: SubjectTopicRef, allGraphs: SubjectGraph[]) => number;
  getTopicsByTier: (
    allGraphs: SubjectGraph[],
    subjects: { id: string; name: string }[],
    currentSubjectId?: string | null,
    contentAvailabilityByTopicRef?: Record<TopicRefKey, boolean>,
  ) => {
    tier: number;
    topics: {
      id: string;
      name: string;
      description: string;
      subjectId: string;
      subjectName: string;
      isContentAvailable: boolean;
      isLocked: boolean;
      isUnlocked: boolean;
      isCurriculumVisible: boolean;
    }[];
  }[];
  getDueCardsCount: (cards?: Array<{ id: string }>) => number;
  getTotalCardsCount: (cards?: Array<{ id: string }>) => number;
  grantBuffFromCatalog: (defId: string, source: string, magnitudeOverride?: number) => void;
  /** If a buff with this defId and source exists, removes it; otherwise grants it from the catalog. */
  toggleBuffFromCatalog: (defId: string, source: string, magnitudeOverride?: number) => void;
  addXP: (ref: SubjectTopicRef, xp: number, options?: { sessionId?: string }) => number;
  updateSM2: (cardId: string, sm2State: {
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReview: number;
  }) => void;
  getSM2Data: (cardId: string) => {
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReview: number;
  } | undefined;
}

export interface ProgressionStore extends ProgressionState, ProgressionActions {}

export const INITIAL_UNLOCK_POINTS = 3;
