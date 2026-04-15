import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { cardRefKey, parseCardRefKey } from '@/lib/topicRef';
import { appEventBus } from '@/infrastructure/eventBus';
import { useUIStore } from '@/store/uiStore';
import {
  applyCrystalXpDelta,
  calculateLevelFromXP,
  calculateXPReward,
  calculateTopicTier,
  filterCardsByDifficulty,
  getTopicUnlockStatus,
  getTopicsByTier as computeTopicsByTier,
  CRYSTAL_XP_PER_LEVEL,
  MAX_CRYSTAL_LEVEL,
} from './progressionUtils';
import { defaultSM2, sm2, SM2Data } from './sm2';
import { Card, SubjectGraph, TopicRef } from '../../types/core';
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
import {
  emitCrystalTrialPregenerateForTopic,
  trialStatusRequiresXpCapAtLevelBoundary,
} from '../crystalTrial';
import { useCrystalTrialStore } from '../crystalTrial/crystalTrialStore';
import {
  hasAddedAnyXp,
  wouldCrossLevelBoundary,
  capXpBelowThreshold,
} from '../crystalTrial/progressionIntegration';

type ProgressionStore = ProgressionState & ProgressionActions;
const PROGRESSION_STORAGE_KEY = 'abyss-progression-v3';
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

function attachSm2(ref: TopicRef, cards: Card[], sm2Map: Record<string, SM2Data>): CardWithSm2[] {
  return cards.map((card) => ({
    ...card,
    sm2: sm2Map[cardRefKey({ ...ref, cardId: card.id })] || defaultSM2,
  }));
}

export const useProgressionStore = create<ProgressionStore>()(
  persist(
    (set, get) => ({
      activeCrystals: [],
      sm2Data: {},
      unlockPoints: INITIAL_UNLOCK_POINTS,
      resonancePoints: 0,
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

      openRitualForTopic: (ref, cards) => {
        set({
          pendingRitual: {
            subjectId: ref.subjectId,
            topicId: ref.topicId,
            cards,
            sessionId: makeRitualSessionId(ref),
          },
        });
      },

      submitAttunementRitual: (payload) => {
        const state = get();
        const now = Date.now();
        if (state.lastRitualSubmittedAt && (now - state.lastRitualSubmittedAt) < ATTUNEMENT_SUBMISSION_COOLDOWN_MS) {
          return null;
        }

        const pending = state.pendingRitual;
        const sessionId =
          pending?.subjectId === payload.subjectId && pending?.topicId === payload.topicId
            ? pending.sessionId
            : makeRitualSessionId({ subjectId: payload.subjectId, topicId: payload.topicId });
        const nextPendingAttunement = {
          subjectId: payload.subjectId,
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
          subjectId: payload.subjectId,
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

      startTopicStudySession: (ref, cards) => {
        const state = get();
        const crystal = state.activeCrystals.find(
          (item) => item.subjectId === ref.subjectId && item.topicId === ref.topicId,
        );
        const level = calculateLevelFromXP(crystal?.xp ?? 0);
        const sm2Augmented = attachSm2(ref, cards, state.sm2Data);
        const activeBuffs = state.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const growthBoost = BuffEngine.get().getModifierTotal('growth_speed', activeBuffs);
        const difficultyBoost = Math.max(0, Math.floor(growthBoost * 10) - 1);
        const maxDifficulty = Math.min(level + 1 + difficultyBoost, 4);
        const gatedCards = filterCardsByDifficulty(sm2Augmented, maxDifficulty);
        const dueCards = sm2.getDueCards(gatedCards);
        const queue = (dueCards.length > 0 ? dueCards : gatedCards).map((card) =>
          cardRefKey({ ...ref, cardId: card.id }),
        );
        const cardDifficultyById = sm2Augmented.reduce<Record<string, number>>((acc, card) => {
          acc[card.id] = card.difficulty;
          return acc;
        }, {});
        const cardTypeById = cards.reduce<Record<string, string>>((acc, card) => {
          acc[card.id] = card.type;
          return acc;
        }, {});
        const pending = state.pendingRitual;
        const sessionId =
          pending?.subjectId === ref.subjectId && pending?.topicId === ref.topicId
            ? pending.sessionId
            : makeStudySessionId(ref);
        const startedAt = Date.now();
        const activeBuffIds = state.activeBuffs.map((buff) => buff.buffId);
        undoManager.reset();
        set({
          currentSession: {
            subjectId: ref.subjectId,
            topicId: ref.topicId,
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
          subjectId: ref.subjectId,
          topicId: ref.topicId,
          sessionId,
          undoCount: undoManager.undoStackSize,
          redoCount: undoManager.redoStackSize,
        });
      },

      focusStudyCard: (ref, cards, focusCardId = null) => {
        get().startTopicStudySession(ref, cards);
        if (!focusCardId) {
          return;
        }

        const session = get().currentSession;
        if (
          !session
          || session.topicId !== ref.topicId
          || session.subjectId !== ref.subjectId
        ) {
          return;
        }

        if (!cards.some((card) => card.id === focusCardId)) {
          return;
        }

        const focusKey = cardRefKey({ ...ref, cardId: focusCardId });
        if (session.queueCardIds.includes(focusKey)) {
          set({
            currentSession: {
              ...session,
              currentCardId: focusKey,
            },
          });
          useUIStore.getState().resetCardFlip();
          return;
        }

        const queue = [focusKey, ...session.queueCardIds.filter((id) => id !== focusKey)];
        set({
          currentSession: {
            ...session,
            queueCardIds: queue,
            currentCardId: focusKey,
            totalCards: queue.length,
          },
        });
        useUIStore.getState().resetCardFlip();
      },

      submitStudyResult: (cardRefKeyStr, rating) => {
        const state = get();
        const session = state.currentSession;
        if (!session || session.currentCardId !== cardRefKeyStr) {
          return;
        }

        const crystal = state.activeCrystals.find(
          (item) => item.subjectId === session.subjectId && item.topicId === session.topicId,
        );
        if (!crystal) {
          return;
        }
        const now = Date.now();
        const timeTakenMs = Math.max(0, now - (session.lastCardStart ?? now));

        const { cardId: rawCardId } = parseCardRefKey(cardRefKeyStr);
        const previousSM2 = state.sm2Data[cardRefKeyStr] || defaultSM2;
        const updatedSM2 = sm2.calculateNextReview(previousSM2, rating);
        const cardFormatType = session.cardTypeById?.[rawCardId];
        const reward = calculateXPReward(cardFormatType, rating);
        const activeBuffs = state.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const buffMultiplier = BuffEngine.get().getModifierTotal('xp_multiplier', activeBuffs);
        const buffedReward = Math.max(0, Math.round(reward * buffMultiplier));

        // --- Crystal Trial: XP gating ---
        const ref: TopicRef = { subjectId: session.subjectId, topicId: session.topicId };
        const previousXp = crystal.xp;
        const currentLevel = calculateLevelFromXP(previousXp);
        const trialStore = useCrystalTrialStore.getState();
        const trialStatus = trialStore.getTrialStatus(ref);

        let effectiveReward = buffedReward;
        let hasBoundaryPregeneration = false;

        if (currentLevel < MAX_CRYSTAL_LEVEL) {
          const { crosses } = wouldCrossLevelBoundary(previousXp, buffedReward);

          if (crosses && trialStatusRequiresXpCapAtLevelBoundary(trialStatus)) {
            const { maxReward } = capXpBelowThreshold(previousXp, currentLevel);
            effectiveReward = maxReward;
            if (trialStatus === 'idle') {
              emitCrystalTrialPregenerateForTopic(ref, state.activeCrystals);
              hasBoundaryPregeneration = true;
            }
          }
        }

        const applied = applyCrystalXpDelta(
          state.activeCrystals,
          ref,
          effectiveReward,
        );
        if (!applied) {
          return;
        }

        undoManager.capture(state);

        const difficulty = session.cardDifficultyById?.[rawCardId] ?? 1;
        const isCorrect = rating >= 3;
        const nextResonance = isCorrect ? state.resonancePoints + 1 : state.resonancePoints;
        const sessionId = session.sessionId ?? makeStudySessionId(ref);
        const attempt: StudySessionAttempt = {
          cardId: cardRefKeyStr,
          rating,
          difficulty,
          timestamp: now,
          isCorrect,
        };
        const nextAttempts = [...(session.attempts ?? []), attempt];
        const nextQueue = session.queueCardIds.filter((id) => id !== cardRefKeyStr);
        const nextCard = nextQueue[0] ?? null;
        const buffsAfterUsage = BuffEngine.get().consumeForEvent(activeBuffs, 'card_reviewed');
        const nextBuffs = nextQueue.length > 0
          ? buffsAfterUsage
          : BuffEngine.get().consumeForEvent(buffsAfterUsage, 'session_ended');
        const isSessionComplete = nextQueue.length === 0;
        const sessionMetrics = isSessionComplete
          ? buildStudySessionMetrics(
              sessionId,
              session.topicId,
              nextAttempts,
              session.startedAt ?? Date.now(),
            )
          : null;

        set({
          resonancePoints: nextResonance,
          unlockPoints: applied.levelsGained > 0 ? state.unlockPoints + applied.levelsGained : state.unlockPoints,
          sm2Data: {
            ...state.sm2Data,
            [cardRefKeyStr]: updatedSM2,
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
          cardId: cardRefKeyStr,
          rating,
          subjectId: session.subjectId,
          topicId: session.topicId,
          sessionId,
          timeTakenMs,
          buffedReward: effectiveReward,
          buffMultiplier,
          difficulty,
          isCorrect,
        });

        if (applied.levelsGained > 0) {
          appEventBus.emit('crystal:leveled', {
            subjectId: session.subjectId,
            topicId: session.topicId,
            from: applied.previousLevel,
            to: applied.nextLevel,
            levelsGained: applied.levelsGained,
            sessionId,
            isStudyPanelOpen: useUIStore.getState().isStudyPanelOpen,
          });
        }

        // --- Crystal Trial: XP pregeneration trigger ---
        if (currentLevel < MAX_CRYSTAL_LEVEL && effectiveReward > 0) {
          const newXp = previousXp + effectiveReward;
          const trialStatusAfter = useCrystalTrialStore.getState().getTrialStatus(ref);
          if (!hasBoundaryPregeneration && hasAddedAnyXp(previousXp, newXp) && trialStatusAfter === 'idle') {
            // Use level from pre-reward XP (currentLevel); post-set crystal XP can differ
            appEventBus.emit('crystal:trial-pregenerate', {
              subjectId: ref.subjectId,
              topicId: ref.topicId,
              currentLevel,
              targetLevel: currentLevel + 1,
            });
          }
        }

        if (isSessionComplete && sessionMetrics) {
          appEventBus.emit('session:completed', {
            subjectId: session.subjectId,
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
        const subjectId = restored.currentSession?.subjectId;
        const sessionId = restored.currentSession?.sessionId;
        if (!topicId?.trim() || !sessionId?.trim() || !subjectId?.trim()) {
          throw new Error('undoLastStudyResult: restored session missing subjectId, topicId or sessionId');
        }
        set(restored);
        useUIStore.getState().resetCardFlip();
        appEventBus.emit('study-panel:history', {
          action: 'undo',
          subjectId,
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
        const subjectId = restored.currentSession?.subjectId;
        const sessionId = restored.currentSession?.sessionId;
        if (!topicId?.trim() || !sessionId?.trim() || !subjectId?.trim()) {
          throw new Error('redoLastStudyResult: restored session missing subjectId, topicId or sessionId');
        }
        set(restored);
        useUIStore.getState().resetCardFlip();
        appEventBus.emit('study-panel:history', {
          action: 'redo',
          subjectId,
          topicId,
          sessionId,
          undoCount: undoManager.undoStackSize,
          redoCount: undoManager.redoStackSize,
        });
      },

      unlockTopic: (ref, allGraphs) => {
        const state = get();
        const existing = state.activeCrystals.find(
          (item) => item.subjectId === ref.subjectId && item.topicId === ref.topicId,
        );
        if (existing) {
          return existing.gridPosition;
        }

        const status = getTopicUnlockStatus(ref, state.activeCrystals, state.unlockPoints, allGraphs);
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
              subjectId: ref.subjectId,
              topicId: ref.topicId,
              gridPosition: nextPosition,
              xp: 0,
              spawnedAt: Date.now(),
            },
          ],
          unlockPoints: Math.max(0, current.unlockPoints - 1),
        }));

        return nextPosition;
      },

      getTopicUnlockStatus: (ref, allGraphs) => {
        return getTopicUnlockStatus(ref, get().activeCrystals, get().unlockPoints, allGraphs);
      },

      getTopicTier: (ref, allGraphs) => {
        return calculateTopicTier(ref, allGraphs);
      },

      getTopicsByTier: (allGraphs, subjects, currentSubjectId, contentAvailabilityByTopicKey) => {
        return computeTopicsByTier(
          allGraphs,
          subjects,
          currentSubjectId,
          contentAvailabilityByTopicKey,
          get().activeCrystals,
        );
      },

      getDueCardsCount: (ref, cards = []) => {
        const withSm2 = attachSm2(ref, cards as Card[], get().sm2Data);
        return sm2.getDueCards(withSm2).length;
      },

      getTotalCardsCount: (cards = []) => {
        return cards.length;
      },

      addXP: (ref, xpAmount, options) => {
        const state = get();

        // --- Crystal Trial: XP gating (mirrors submitStudyResult) ---
        const crystal = state.activeCrystals.find(
          (item) => item.subjectId === ref.subjectId && item.topicId === ref.topicId,
        );
        let effectiveXpAmount = xpAmount;

        if (crystal) {
          const previousXp = crystal.xp;
          const currentLevel = calculateLevelFromXP(previousXp);

          if (currentLevel < MAX_CRYSTAL_LEVEL) {
            const trialStore = useCrystalTrialStore.getState();
            const trialStatus = trialStore.getTrialStatus(ref);
            const { crosses } = wouldCrossLevelBoundary(previousXp, xpAmount);

            if (crosses && trialStatus !== 'idle' && trialStatusRequiresXpCapAtLevelBoundary(trialStatus)) {
              const { maxReward } = capXpBelowThreshold(previousXp, currentLevel);
              effectiveXpAmount = maxReward;
            }
          }

          const trialStatus = useCrystalTrialStore.getState().getTrialStatus(ref);
          const newXp = previousXp + effectiveXpAmount;
          if (currentLevel < MAX_CRYSTAL_LEVEL && hasAddedAnyXp(previousXp, newXp) && trialStatus === 'idle') {
            appEventBus.emit('crystal:trial-pregenerate', {
              subjectId: ref.subjectId,
              topicId: ref.topicId,
              currentLevel,
              targetLevel: currentLevel + 1,
            });
          }
        }

        const snapshotCrystals = state.activeCrystals;
        const xpForEvents = applyCrystalXpDelta(snapshotCrystals, ref, effectiveXpAmount);
        if (!xpForEvents) {
          return 0;
        }

        set((current) => {
          const applied = applyCrystalXpDelta(current.activeCrystals, ref, effectiveXpAmount);
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
            subjectId: ref.subjectId,
            topicId: ref.topicId,
            from: xpForEvents.previousLevel,
            to: xpForEvents.nextLevel,
            levelsGained: xpForEvents.levelsGained,
            sessionId: options?.sessionId ?? 'xp-adjustment',
            isStudyPanelOpen: useUIStore.getState().isStudyPanelOpen,
          });
        }
        return xpForEvents.nextXp;
      },

      updateSM2: (ref, rawCardId, sm2State) => {
        const key = cardRefKey({ ...ref, cardId: rawCardId });
        set((s) => ({
          sm2Data: {
            ...s.sm2Data,
            [key]: sm2State,
          },
        }));
      },

      getSM2Data: (ref, rawCardId) => {
        const key = cardRefKey({ ...ref, cardId: rawCardId });
        return get().sm2Data[key];
      },
    }),
    {
      name: PROGRESSION_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({
        activeCrystals: state.activeCrystals,
        sm2Data: state.sm2Data,
        unlockPoints: state.unlockPoints,
        resonancePoints: state.resonancePoints,
        currentSubjectId: state.currentSubjectId,
        currentSession: state.currentSession,
        activeBuffs: state.activeBuffs,
        pendingRitual: state.pendingRitual,
        lastRitualSubmittedAt: state.lastRitualSubmittedAt,
      }),
    },
  ),
);
