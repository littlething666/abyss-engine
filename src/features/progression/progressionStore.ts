import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { appEventBus } from '@/infrastructure/eventBus';
import { readRawTelemetryEventsFromStorage } from '@/infrastructure/telemetryRawLog';
import { useUIStore } from '@/store/uiStore';
import {
  applyCrystalXpDelta,
  calculateLevelFromXP,
  calculateXPReward,
  calculateTopicTier,
  filterCardsByDifficulty,
  getTopicUnlockStatus,
  getTopicsByTier as computeTopicsByTier,
} from './progressionUtils';
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
  makeRitualSessionId,
  makeStudySessionId,
} from '../analytics/attunementMetrics';
import { calculateRitualHarmony, deriveRitualBuffs } from './progressionRitual';
import { undoManager } from './undoManager';

type ProgressionStore = ProgressionState & ProgressionActions;
const PROGRESSION_STORAGE_KEY = 'abyss-progression';
export const ATTUNEMENT_SUBMISSION_COOLDOWN_MS = 8 * 60 * 60 * 1000;

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
      unlockPoints: INITIAL_UNLOCK_POINTS,
      currentSubjectId: null,
      currentSession: null,
      activeBuffs: [],
      pendingRitual: null,
      lastRitualSubmittedAt: null,

      initialize: () => {
        const currentState = get();
        const hydratedActiveBuffs = currentState.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const activeBuffsAfterSessionEnd = BuffEngine.get().consumeForEvent(hydratedActiveBuffs, 'session_ended');
        const activeBuffs = BuffEngine.get().pruneExpired(activeBuffsAfterSessionEnd);
        set(() => ({
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
        if (state.lastRitualSubmittedAt && (now - state.lastRitualSubmittedAt) < ATTUNEMENT_SUBMISSION_COOLDOWN_MS) {
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
          lastRitualSubmittedAt: now,
        });

        const checklistKeys = Object.keys(payload.checklist).filter(
          (k) => Boolean(payload.checklist[k as keyof typeof payload.checklist]),
        );

        appEventBus.emit('ritual:submitted', {
          topicId: payload.topicId,
          harmonyScore,
          readinessBucket,
          checklistKeys,
          buffsGranted: buffs,
        });

        return {
          harmonyScore,
          readinessBucket,
          buffs,
        };
      },

      getRemainingRitualCooldownMs: (atMs) => {
        const last = get().lastRitualSubmittedAt;
        if (!last) {
          return 0;
        }
        return Math.max(0, ATTUNEMENT_SUBMISSION_COOLDOWN_MS - (atMs - last));
      },

      clearActiveBuffs: () => set({ activeBuffs: [] }),
      clearPendingRitual: () => set({ pendingRitual: null }),

      grantBuffFromCatalog: (defId, source, magnitudeOverride) => {
        const buff = BuffEngine.get().grantBuff(defId, source, magnitudeOverride);
        set((state) => ({
          activeBuffs: normalizeActiveBuffs(state, [buff]),
        }));
      },

      toggleBuffFromCatalog: (defId, source, magnitudeOverride) => {
        set((state) => {
          const matches = (b: Buff) => b.buffId === defId && (b.source ?? 'legacy') === source;
          if (state.activeBuffs.some(matches)) {
            return {
              activeBuffs: state.activeBuffs.filter((b) => !matches(b)),
            };
          }
          const buff = BuffEngine.get().grantBuff(defId, source, magnitudeOverride);
          return {
            activeBuffs: normalizeActiveBuffs(state, [buff]),
          };
        });
      },

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
        const cardTypeById = cards.reduce<Record<string, string>>((acc, card) => {
          acc[card.id] = card.type;
          return acc;
        }, {});
        const sessionId = state.pendingRitual?.topicId === topicId
          ? state.pendingRitual.sessionId
          : makeStudySessionId(topicId);
        const startedAt = Date.now();
        const activeBuffIds = state.activeBuffs.map((buff) => buff.buffId);
        undoManager.reset();
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
            cardTypeById,
          },
          pendingRitual: null,
        });
        useUIStore.getState().resetCardFlip();
        appEventBus.emit('study-panel:history', {
          action: 'submit',
          topicId,
          sessionId,
          undoCount: undoManager.undoStackSize,
          redoCount: undoManager.redoStackSize,
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
          });
          useUIStore.getState().resetCardFlip();
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
        });
        useUIStore.getState().resetCardFlip();
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

        const previousSM2 = state.sm2Data[cardId] || defaultSM2;
        const updatedSM2 = sm2.calculateNextReview(previousSM2, rating);
        const cardFormatType = session.cardTypeById?.[cardId];
        const reward = calculateXPReward(cardFormatType, rating);
        const activeBuffs = state.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const buffMultiplier = BuffEngine.get().getModifierTotal('xp_multiplier', activeBuffs);
        const buffedReward = Math.max(0, Math.round(reward * buffMultiplier));
        const applied = applyCrystalXpDelta(state.activeCrystals, session.topicId, buffedReward);
        if (!applied) {
          return;
        }

        undoManager.capture(state);

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

        set({
          unlockPoints: applied.levelsGained > 0 ? state.unlockPoints + applied.levelsGained : state.unlockPoints,
          sm2Data: {
            ...state.sm2Data,
            [cardId]: updatedSM2,
          },
          activeCrystals: applied.nextActiveCrystals,
          currentSession: {
            ...session,
            attempts: nextAttempts,
            queueCardIds: nextQueue,
            currentCardId: nextCard,
            totalCards: Math.max(session.totalCards - 1, 0),
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
        });

        useUIStore.getState().resetCardFlip();

        appEventBus.emit('card:reviewed', {
          cardId,
          rating,
          topicId: session.topicId,
          sessionId,
          timeTakenMs,
          buffedReward,
          buffMultiplier,
          difficulty,
          isCorrect,
        });

        if (applied.levelsGained > 0) {
          appEventBus.emit('crystal:leveled', {
            topicId: session.topicId,
            from: applied.previousLevel,
            to: applied.nextLevel,
            levelsGained: applied.levelsGained,
            sessionId,
            isStudyPanelOpen: useUIStore.getState().isStudyPanelOpen,
          });
        }

        if (isSessionComplete && sessionMetrics) {
          appEventBus.emit('session:completed', {
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
        const restored = undoManager.undo(state);
        if (!restored) {
          return;
        }
        const topicId = restored.currentSession?.topicId;
        const sessionId = restored.currentSession?.sessionId;
        if (!topicId?.trim() || !sessionId?.trim()) {
          throw new Error('undoLastStudyResult: restored session missing topicId or sessionId');
        }
        set(restored);
        useUIStore.getState().resetCardFlip();
        appEventBus.emit('study-panel:history', {
          action: 'undo',
          topicId,
          sessionId,
          undoCount: undoManager.undoStackSize,
          redoCount: undoManager.redoStackSize,
        });
      },

      redoLastStudyResult: () => {
        const state = get();
        const restored = undoManager.redo(state);
        if (!restored) {
          return;
        }
        const topicId = restored.currentSession?.topicId;
        const sessionId = restored.currentSession?.sessionId;
        if (!topicId?.trim() || !sessionId?.trim()) {
          throw new Error('redoLastStudyResult: restored session missing topicId or sessionId');
        }
        set(restored);
        useUIStore.getState().resetCardFlip();
        appEventBus.emit('study-panel:history', {
          action: 'redo',
          topicId,
          sessionId,
          undoCount: undoManager.undoStackSize,
          redoCount: undoManager.redoStackSize,
        });
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

      getTopicsByTier: (allGraphs, subjects, currentSubjectId, contentAvailabilityByTopicId) => {
        const unlockedTopicIds = get().activeCrystals.map((c) => c.topicId);
        return computeTopicsByTier(allGraphs, unlockedTopicIds, subjects, currentSubjectId, contentAvailabilityByTopicId);
      },

      getDueCardsCount: (cards = []) => {
        const withSm2 = attachSm2(cards as Card[], get().sm2Data);
        return sm2.getDueCards(withSm2).length;
      },

      getTotalCardsCount: (cards = []) => {
        return cards.length;
      },

      addXP: (topicId, xpAmount, options) => {
        const snapshotCrystals = get().activeCrystals;
        const xpForEvents = applyCrystalXpDelta(snapshotCrystals, topicId, xpAmount);
        if (!xpForEvents) {
          return 0;
        }

        set((current) => {
          const applied = applyCrystalXpDelta(current.activeCrystals, topicId, xpAmount);
          if (!applied) {
            return {};
          }
          return {
            activeCrystals: applied.nextActiveCrystals,
            unlockPoints:
              applied.levelsGained > 0 ? current.unlockPoints + applied.levelsGained : current.unlockPoints,
          };
        });

        if (xpForEvents.levelsGained > 0) {
          appEventBus.emit('crystal:leveled', {
            topicId,
            from: xpForEvents.previousLevel,
            to: xpForEvents.nextLevel,
            levelsGained: xpForEvents.levelsGained,
            sessionId: options?.sessionId ?? 'xp-adjustment',
            isStudyPanelOpen: useUIStore.getState().isStudyPanelOpen,
          });
        }
        return xpForEvents.nextXp;
      },

      updateSM2: (cardId, sm2State) => {
        set((s) => ({
          sm2Data: {
            ...s.sm2Data,
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
      version: 1,
      migrate: (persisted, fromVersion) => {
        const persistedRecord = persisted as Record<string, unknown>;
        if (fromVersion < 1) {
          delete persistedRecord.unlockedTopicIds;
          delete persistedRecord.isCurrentCardFlipped;
          persistedRecord.currentSession = null;

          let lastRitual: number | null = null;
          if (typeof window !== 'undefined') {
            const events = readRawTelemetryEventsFromStorage();
            const latest = events
              .filter((e) => e.type === 'attunement_ritual_submitted')
              .reduce((max, e) => Math.max(max, e.timestamp), 0);
            lastRitual = latest > 0 ? latest : null;
          }
          persistedRecord.lastRitualSubmittedAt = lastRitual;
        }
        return persisted;
      },
      partialize: (state) => ({
        activeCrystals: state.activeCrystals,
        sm2Data: state.sm2Data,
        unlockPoints: state.unlockPoints,
        currentSubjectId: state.currentSubjectId,
        currentSession: state.currentSession,
        activeBuffs: state.activeBuffs,
        pendingRitual: state.pendingRitual,
        lastRitualSubmittedAt: state.lastRitualSubmittedAt,
      }),
    },
  ),
);
