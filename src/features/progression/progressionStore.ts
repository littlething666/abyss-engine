import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  MAX_UNDO_DEPTH,
  calculateLevelFromXP,
  calculateXPReward,
  calculateTopicTier,
  filterCardsByDifficulty,
  captureUndoSnapshot,
  restoreUndoSnapshot,
  trimUndoSnapshotStack,
  getTopicUnlockStatus,
  getTopicsByTier,
} from './progressionUtils';
import type { ProgressionEventPayload, ProgressionEventType } from './events';
import { defaultSM2, sm2, SM2Data } from './sm2';
import { Card, SubjectGraph } from '../../types/core';
import {
  AttunementRitualPayload,
  StudySessionAttempt,
  INITIAL_UNLOCK_POINTS,
  ProgressionActions,
  ProgressionState,
  Rating,
  Buff,
} from '../../types/progression';
import { BuffEngine } from './buffs/buffEngine';
import { findNextGridPosition } from './gridUtils';
import {
  buildStudySessionMetrics,
  calculateRitualHarmony,
  deriveRitualBuffs,
  makeRitualSessionId,
  makeStudySessionId,
} from '../analytics/attunementMetrics';
import { telemetry } from '../telemetry';

type ProgressionStore = ProgressionState & ProgressionActions;
const PROGRESSION_STORAGE_KEY = 'abyss-progression';
export const ATTUNEMENT_SUBMISSION_COOLDOWN_MS = 8 * 60 * 60 * 1000;

function getRemainingRitualCooldownMs(atMs: number): number {
  const latestSubmission = telemetry.getStore.getState().events.reduce<number | null>((acc, event) => {
    if (event.type !== 'attunement_ritual_submitted') {
      return acc;
    }
    if (acc === null || event.timestamp > acc) {
      return event.timestamp;
    }
    return acc;
  }, null);

  if (latestSubmission === null) {
    return 0;
  }

  const elapsed = atMs - latestSubmission;
  const remaining = ATTUNEMENT_SUBMISSION_COOLDOWN_MS - elapsed;
  return Math.max(0, remaining);
}

interface CardWithSm2 extends Card {
  sm2: SM2Data;
}

function normalizeActiveBuffs(state: { activeBuffs: Buff[] }, incoming: Buff[]): Buff[] {
  const nonSession = state.activeBuffs
    .map((buff) => BuffEngine.get().hydrateBuff(buff))
    .filter((buff) => buff.condition !== 'session_end');
  const sanitizedIncoming = incoming.map((buff) => BuffEngine.get().hydrateBuff(buff));
  const combined = [...nonSession, ...sanitizedIncoming];
  return dedupeBuffsById(combined);
}

function dedupeBuffsById(buffs: Buff[]): Buff[] {
  const seen = new Set<string>();
  const deduped: Buff[] = [];
  for (let index = buffs.length - 1; index >= 0; index -= 1) {
    const buff = buffs[index];
    const dedupeKey = !buff ? '' : `${buff.buffId}|${buff.source ?? 'unknown'}|${buff.condition}`;
    if (!buff || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    deduped.push(buff);
  }
  return deduped.reverse();
}

function attachSm2(cards: Card[], sm2Map: Record<string, SM2Data>): CardWithSm2[] {
  return cards.map((card) => ({
    ...card,
    sm2: sm2Map[card.id] || defaultSM2,
  }));
}

export const useProgressionStore = create<ProgressionStore>()(
  persist(
    (set, get) => ({
      activeCrystals: [],
      sm2Data: {},
      unlockedTopicIds: [],
      unlockPoints: INITIAL_UNLOCK_POINTS,
      currentSubjectId: null,
      currentSession: null,
      studyLevelUp: null,
      isCurrentCardFlipped: false,
      activeBuffs: [],
      pendingRitual: null,

      initialize: () => {
        const currentState = get();
        const hydratedActiveBuffs = currentState.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const activeBuffsAfterSessionEnd = BuffEngine.get().consumeForEvent(hydratedActiveBuffs, 'session_ended');
        const activeBuffs = BuffEngine.get().pruneExpired(activeBuffsAfterSessionEnd);
        set(() => ({
          studyLevelUp: null,
          activeBuffs: dedupeBuffsById(activeBuffs),
        }));
      },

      setCurrentSubject: (subjectId) => set({ currentSubjectId: subjectId }),

      openRitualForTopic: (topicId, cards) => {
        set({
          pendingRitual: {
            topicId,
            cards,
            sessionId: makeRitualSessionId(topicId),
          },
        });
      },

      submitAttunementRitual: (payload) => {
        const state = get();
        const now = Date.now();
        if (getRemainingRitualCooldownMs(now) > 0) {
          return null;
        }

        const sessionId = state.pendingRitual?.topicId === payload.topicId
          ? state.pendingRitual.sessionId
          : makeRitualSessionId(payload.topicId);
        const nextPendingAttunement = {
          topicId: payload.topicId,
          cards: [],
          sessionId,
        };
        const { harmonyScore, readinessBucket } = calculateRitualHarmony(payload.checklist);
        const buffs = deriveRitualBuffs(payload);

        set({
          activeBuffs: normalizeActiveBuffs(state, buffs),
          pendingRitual: nextPendingAttunement,
        });

        return {
          harmonyScore,
          readinessBucket,
          buffs,
        };
      },

      getRemainingRitualCooldownMs: (atMs) => {
        return getRemainingRitualCooldownMs(atMs);
      },

      emitEvent: <T extends ProgressionEventType>(type: T, payload: ProgressionEventPayload<T>) => {
        if (typeof window === 'undefined') {
          return;
        }
        window.dispatchEvent(new CustomEvent(`abyss-progression-${type}`, { detail: payload }));
      },

      clearStudyLevelUp: () => set({ studyLevelUp: null }),

      clearActiveBuffs: () => set({ activeBuffs: [] }),
      clearPendingRitual: () => set({ pendingRitual: null }),

      startTopicStudySession: (topicId, cards) => {
        const state = get();
        const crystal = state.activeCrystals.find((item) => item.topicId === topicId);
        const level = calculateLevelFromXP(crystal?.xp ?? 0);
        const sm2Augmented = attachSm2(cards, state.sm2Data);
        const activeBuffs = state.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const growthBoost = BuffEngine.get().getModifierTotal('growth_speed', activeBuffs);
        const difficultyBoost = Math.max(0, Math.floor(growthBoost * 10) - 1);
        const maxDifficulty = Math.min(level + 1 + difficultyBoost, 4);
        const gatedCards = filterCardsByDifficulty(sm2Augmented, maxDifficulty);
        const dueCards = sm2.getDueCards(gatedCards);
        const queue = (dueCards.length > 0 ? dueCards : gatedCards).map((card) => card.id);
        const cardDifficultyById = sm2Augmented.reduce<Record<string, number>>((acc, card) => {
          acc[card.id] = card.difficulty;
          return acc;
        }, {});
        const sessionId = state.pendingRitual?.topicId === topicId
          ? state.pendingRitual.sessionId
          : makeStudySessionId(topicId);
        const startedAt = Date.now();
        const activeBuffIds = state.activeBuffs.map((buff) => buff.buffId);
        set({
          currentSession: {
            topicId,
            queueCardIds: queue,
            currentCardId: queue[0] ?? null,
            totalCards: queue.length,
            sessionId,
            startedAt,
            lastCardStart: startedAt,
            activeBuffIds,
            attempts: [],
            cardDifficultyById,
            undoStack: [],
            redoStack: [],
          },
          isCurrentCardFlipped: false,
          pendingRitual: null,
        });
        get().emitEvent('study-panel-history', {
          action: 'submit',
          topicId,
          sessionId,
          undoCount: 0,
          redoCount: 0,
        });
      },

      focusStudyCard: (topicId, cards, focusCardId = null) => {
        get().startTopicStudySession(topicId, cards);
        if (!focusCardId) {
          return;
        }

        const session = get().currentSession;
        if (!session || session.topicId !== topicId) {
          return;
        }

        if (!cards.some((card) => card.id === focusCardId)) {
          return;
        }

        if (session.queueCardIds.includes(focusCardId)) {
          set({
            currentSession: {
              ...session,
              currentCardId: focusCardId,
            },
            isCurrentCardFlipped: false,
          });
          return;
        }

        const queue = [focusCardId, ...session.queueCardIds.filter((id) => id !== focusCardId)];
        set({
          currentSession: {
            ...session,
            queueCardIds: queue,
            currentCardId: focusCardId,
            totalCards: queue.length,
          },
          isCurrentCardFlipped: false,
        });
      },

      submitStudyResult: (cardId, rating) => {
        const state = get();
        const session = state.currentSession;
        if (!session || session.currentCardId !== cardId) {
          return;
        }

        const crystal = state.activeCrystals.find((item) => item.topicId === session.topicId);
        if (!crystal) {
          return;
        }
        const now = Date.now();
        const timeTakenMs = Math.max(0, now - (session.lastCardStart ?? now));

        const undoSnapshot = captureUndoSnapshot(state);
        const nextUndoStack = trimUndoSnapshotStack([
          ...(session.undoStack || []),
          undoSnapshot,
        ]);

        const previousSM2 = state.sm2Data[cardId] || defaultSM2;
        const updatedSM2 = sm2.calculateNextReview(previousSM2, rating);
        const reward = calculateXPReward(undefined, rating);
        const activeBuffs = state.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const buffMultiplier = BuffEngine.get().getModifierTotal('xp_multiplier', activeBuffs);
        const buffedReward = Math.max(0, Math.round(reward * buffMultiplier));
        const xp = crystal.xp + buffedReward;
        const previousLevel = calculateLevelFromXP(crystal.xp);
        const nextLevel = calculateLevelFromXP(xp);
        const unlockedLevels = nextLevel - previousLevel;
        const difficulty = session.cardDifficultyById?.[cardId] ?? 1;
        const isCorrect = rating >= 3;
        const sessionId = session.sessionId ?? makeStudySessionId(session.topicId);
        const attempt: StudySessionAttempt = {
          cardId,
          rating,
          difficulty,
          timestamp: now,
          isCorrect,
        };
        const nextAttempts = [...(session.attempts ?? []), attempt];
        const nextQueue = session.queueCardIds.filter((id) => id !== cardId);
        const nextCard = nextQueue[0] ?? null;
        const buffsAfterUsage = BuffEngine.get().consumeForEvent(activeBuffs, 'card_reviewed');
        const nextBuffs = nextQueue.length > 0
          ? buffsAfterUsage
          : BuffEngine.get().consumeForEvent(buffsAfterUsage, 'session_ended');
        const isSessionComplete = nextQueue.length === 0;
        const sessionMetrics = isSessionComplete
          ? buildStudySessionMetrics(sessionId, session.topicId, nextAttempts, session.startedAt ?? Date.now())
          : null;

        set((current) => ({
          unlockPoints: unlockedLevels > 0 ? current.unlockPoints + unlockedLevels : current.unlockPoints,
          sm2Data: {
            ...current.sm2Data,
            [cardId]: updatedSM2,
          },
          activeCrystals: current.activeCrystals.map((item) =>
            item.topicId === session.topicId
              ? {
                  ...item,
                  xp: xp,
                }
              : item,
          ),
          currentSession: {
            ...session,
            attempts: nextAttempts,
            queueCardIds: nextQueue,
            currentCardId: nextCard,
            totalCards: Math.max(session.totalCards - 1, 0),
            undoStack: nextUndoStack,
            redoStack: [],
            ...(isSessionComplete
              ? {
                startedAt: session.startedAt ?? Date.now(),
                lastCardStart: now,
              }
              : {
                lastCardStart: now,
              }),
          },
          activeBuffs: nextBuffs,
          isCurrentCardFlipped: false,
          studyLevelUp:
            unlockedLevels > 0
              ? {
                  topicId: session.topicId,
                  sessionId,
                  newLevel: nextLevel,
                  previousLevel,
                  unlockPointsGained: unlockedLevels,
                  previousXp: crystal.xp,
                  finalXp: xp,
                }
              : null,
        }));
        get().emitEvent('xp-gained', {
          amount: buffedReward,
          rating,
          cardId,
          topicId: session.topicId,
          sessionId,
          difficulty,
          isCorrect,
          timeTakenMs,
          buffMultiplier,
          reward,
        });
        if (isSessionComplete && sessionMetrics) {
          get().emitEvent('session-complete', {
            topicId: session.topicId,
            sessionId,
            correctRate: sessionMetrics.correctRate,
            sessionDurationMs: sessionMetrics.sessionDurationMs,
            totalAttempts: sessionMetrics.cardsCompleted,
          });
        }
      },

      undoLastStudyResult: () => {
        const state = get();
        const session = state.currentSession;
        if (!session || (session.undoStack ?? []).length === 0) {
          return;
        }

        const snapshot = (session.undoStack || [])[session.undoStack.length - 1];
        const nextUndoStack = (session.undoStack || []).slice(0, -1);
        const redoSnapshot = captureUndoSnapshot(state);
        const nextRedoStack = trimUndoSnapshotStack([
          ...(session.redoStack || []),
          redoSnapshot,
        ]);
        const restored = restoreUndoSnapshot(state, snapshot);

        set({
          ...restored,
          studyLevelUp: null,
          currentSession: {
            ...restored.currentSession,
            undoStack: nextUndoStack,
            redoStack: nextRedoStack,
          },
        });
        get().emitEvent('study-panel-history', {
          action: 'undo',
          topicId: restored.currentSession?.topicId,
          sessionId: restored.currentSession?.sessionId,
          undoCount: nextUndoStack.length,
          redoCount: nextRedoStack.length,
        });
      },

      redoLastStudyResult: () => {
        const state = get();
        const session = state.currentSession;
        if (!session || (session.redoStack || []).length === 0) {
          return;
        }

        const snapshot = (session.redoStack || [])[session.redoStack.length - 1];
        const nextRedoStack = (session.redoStack || []).slice(0, -1);
        const undoSnapshot = captureUndoSnapshot(state);
        const nextUndoStack = trimUndoSnapshotStack([
          ...(session.undoStack || []),
          undoSnapshot,
        ]);
        const restored = restoreUndoSnapshot(state, snapshot);

        set({
          ...restored,
          studyLevelUp: null,
          currentSession: {
            ...restored.currentSession,
            undoStack: nextUndoStack,
            redoStack: nextRedoStack,
          },
        });
        get().emitEvent('study-panel-history', {
          action: 'redo',
          topicId: restored.currentSession?.topicId,
          sessionId: restored.currentSession?.sessionId,
          undoCount: nextUndoStack.length,
          redoCount: nextRedoStack.length,
        });
      },

      flipCurrentCard: () => {
        set((state) => ({ isCurrentCardFlipped: !state.isCurrentCardFlipped }));
      },

      unlockTopic: (topicId, allGraphs) => {
        const state = get();
        const existing = state.activeCrystals.find((item) => item.topicId === topicId);
        if (existing) {
          return existing.gridPosition;
        }

        const status = getTopicUnlockStatus(topicId, state.activeCrystals, state.unlockPoints, allGraphs);
        if (!status.canUnlock) {
          return null;
        }

        const nextPosition = findNextGridPosition(state.activeCrystals);
        if (!nextPosition) {
          return null;
        }

        set((current) => ({
          unlockedTopicIds: [...current.unlockedTopicIds, topicId],
          activeCrystals: [
            ...current.activeCrystals,
            {
              topicId,
              gridPosition: nextPosition,
              xp: 0,
              spawnedAt: Date.now(),
            },
          ],
          unlockPoints: Math.max(0, current.unlockPoints - 1),
        }));

        return nextPosition;
      },

      getTopicUnlockStatus: (topicId, allGraphs) => {
        return getTopicUnlockStatus(topicId, get().activeCrystals, get().unlockPoints, allGraphs);
      },

      getTopicTier: (topicId, allGraphs) => {
        return calculateTopicTier(topicId, allGraphs);
      },

      getTopicsByTier: (allGraphs, unlockedTopicIds, subjects, currentSubjectId) => {
        return getTopicsByTier(allGraphs, unlockedTopicIds, subjects, currentSubjectId);
      },

      getDueCardsCount: (cards = []) => {
        const withSm2 = attachSm2(cards as Card[], get().sm2Data);
        return sm2.getDueCards(withSm2).length;
      },

      getTotalCardsCount: (cards = []) => {
        return cards.length;
      },

      addXP: (topicId, xpAmount) => {
        const crystal = get().activeCrystals.find((item) => item.topicId === topicId);
        if (!crystal) {
          return 0;
        }

        const nextXp = crystal.xp + xpAmount;
        set((state) => ({
          activeCrystals: state.activeCrystals.map((item) =>
            item.topicId === topicId
              ? {
                  ...item,
                  xp: nextXp,
                }
              : item,
          ),
        }));
        return nextXp;
      },

      updateSM2: (cardId, sm2State) => {
        set((state) => ({
          sm2Data: {
            ...state.sm2Data,
            [cardId]: sm2State,
          },
        }));
      },

      getSM2Data: (cardId) => {
        return get().sm2Data[cardId];
      },
    }),
    {
      name: PROGRESSION_STORAGE_KEY,
      partialize: (state) => ({
        activeCrystals: state.activeCrystals,
        sm2Data: state.sm2Data,
        unlockedTopicIds: state.unlockedTopicIds,
        unlockPoints: state.unlockPoints,
        currentSubjectId: state.currentSubjectId,
        currentSession: state.currentSession,
        activeBuffs: state.activeBuffs,
        pendingRitual: state.pendingRitual,
      }),
    },
  ),
);
