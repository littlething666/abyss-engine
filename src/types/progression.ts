import type { ActiveCrystal, Card } from './core';
import type { SubjectGraph } from './core';
import type { ProgressionEventPayload, ProgressionEventType } from '../features/progression/events';

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

export interface AttunementRitualPayload {
  topicId: string;
  checklist: AttunementRitualChecklist;
}

export interface AttunementRitualResult {
  harmonyScore: number;
  readinessBucket: AttunementReadinessBucket;
  buffs: Buff[];
}

export interface AttunementRitualRecord {
  sessionId: string;
  topicId: string;
  startedAt: number;
  completedAt: number | null;
  harmonyScore: number;
  readinessBucket: AttunementReadinessBucket;
  checklist: AttunementRitualChecklist;
  buffs: Buff[];
}

export interface StudySessionAttempt {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  difficulty: number;
  timestamp: number;
  isCorrect: boolean;
}

export interface StudySessionTelemetryRecord {
  sessionId: string;
  topicId: string;
  startedAt: number;
  completedAt: number;
  attempts: StudySessionAttempt[];
  totalAttempts: number;
  cardsCompleted: number;
  avgRating: number;
  correctRate: number;
  sessionDurationMs: number;
  ritualSessionId?: string;
}

export interface PendingRitualState {
  topicId: string;
  cards: Card[];
  sessionId: string;
}

export interface PendingAttunementState extends PendingRitualState {}

export type Rating = 1 | 2 | 3 | 4;

export interface StudySession {
  topicId: string;
  queueCardIds: string[];
  currentCardId: string | null;
  totalCards: number;
  sessionId?: string;
  startedAt?: number;
  activeBuffIds?: string[];
  attempts?: StudySessionAttempt[];
  cardDifficultyById?: Record<string, number>;
  undoStack: StudyUndoSnapshot[];
  redoStack: StudyUndoSnapshot[];
}

export interface StudySessionCore extends Omit<StudySession, 'undoStack' | 'redoStack'> {}

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
  attunementRituals: AttunementRitualRecord[];
  studySessionHistory: StudySessionTelemetryRecord[];
}

export interface ProgressionState {
  activeCrystals: ActiveCrystal[];
  sm2Data: Record<string, {
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReview: number;
  }>;
  unlockedTopicIds: string[];
  unlockPoints: number;
  currentSubjectId: string | null;
  currentSession: StudySession | null;
  levelUpMessage: string | null;
  isCurrentCardFlipped: boolean;
  activeBuffs: Buff[];
  attunementRituals: AttunementRitualRecord[];
  studySessionHistory: StudySessionTelemetryRecord[];
  pendingRitual: PendingRitualState | null;
}

export interface ProgressionActions {
  initialize: () => void;
  setCurrentSubject: (subjectId: string | null) => void;
  startTopicStudySession: (topicId: string, cards: Card[]) => void;
  openRitualForTopic: (topicId: string, cards: Card[]) => void;
  submitAttunementRitual: (payload: AttunementRitualPayload) => AttunementRitualResult | null;
  getRemainingRitualCooldownMs: (atMs: number) => number;
  clearActiveBuffs: () => void;
  clearPendingRitual: () => void;
  submitStudyResult: (cardId: string, rating: Rating) => void;
  undoLastStudyResult: () => void;
  redoLastStudyResult: () => void;
  flipCurrentCard: () => void;
  emitEvent: <T extends ProgressionEventType>(type: T, payload: ProgressionEventPayload<T>) => void;
  unlockTopic: (topicId: string, allGraphs: SubjectGraph[]) => [number, number] | null;
  getTopicUnlockStatus: (topicId: string, allGraphs: SubjectGraph[]) => {
    canUnlock: boolean;
    hasPrerequisites: boolean;
    hasEnoughPoints: boolean;
    missingPrerequisites: {
      topicId: string;
      topicName: string;
      requiredLevel: number;
      currentLevel: number;
    }[];
  };
  getTopicTier: (topicId: string, allGraphs: SubjectGraph[]) => number;
  getTopicsByTier: (
    allGraphs: SubjectGraph[],
    unlockedTopicIds: string[],
    subjects: { id: string; name: string }[],
    currentSubjectId?: string | null,
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
    }[];
  }[];
  getDueCardsCount: (cards?: Array<{ id: string }>) => number;
  getTotalCardsCount: (cards?: Array<{ id: string }>) => number;
  addXP: (topicId: string, xp: number) => number;
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
