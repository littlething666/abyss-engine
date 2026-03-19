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
  AttunementRitualRecord,
  StudySessionAttempt,
  StudySessionTelemetryRecord,
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

type ProgressionStore = ProgressionState & ProgressionActions;
const PROGRESSION_STORAGE_KEY = 'abyss-progression';
const ATTUNEMENT_RITUALS_STORAGE_KEY = `${PROGRESSION_STORAGE_KEY}-attunement-rituals`;
const STUDY_SESSIONS_STORAGE_KEY = `${PROGRESSION_STORAGE_KEY}-study-sessions`;
export const ATTUNEMENT_SUBMISSION_COOLDOWN_MS = 8 * 60 * 60 * 1000;

function safeParseJSON<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readFromStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  return safeParseJSON<T>(raw);
}

function writeToStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function getInitialAttunementRituals(): AttunementRitualRecord[] {
  const separateStore = readFromStorage<AttunementRitualRecord[]>(ATTUNEMENT_RITUALS_STORAGE_KEY);
  if (Array.isArray(separateStore)) {
    return separateStore;
  }

  return [];
}

function getInitialStudySessionHistory(): StudySessionTelemetryRecord[] {
  const separateStore = readFromStorage<StudySessionTelemetryRecord[]>(STUDY_SESSIONS_STORAGE_KEY);
  if (Array.isArray(separateStore)) {
    return separateStore;
  }

  return [];
}

function getLatestRitualSession(records: AttunementRitualRecord[]): AttunementRitualRecord | null {
  const ritualSessions = records.filter((session) => Object.keys(session.checklist).length > 0);
  if (ritualSessions.length === 0) {
    return null;
  }

  return ritualSessions.reduce<AttunementRitualRecord | null>((latest, session) => {
    if (!latest) {
      return session;
    }
    return session.startedAt > latest.startedAt ? session : latest;
  }, null);
}

function getRemainingRitualCooldownMs(records: AttunementRitualRecord[], atMs: number): number {
  const latestSession = getLatestRitualSession(records);
  if (!latestSession) {
    return 0;
  }
  const elapsed = atMs - latestSession.startedAt;
  const remaining = ATTUNEMENT_SUBMISSION_COOLDOWN_MS - elapsed;
  return Math.max(0, remaining);
}

function persistAttunementRituals(sessions: AttunementRitualRecord[]) {
  writeToStorage(ATTUNEMENT_RITUALS_STORAGE_KEY, sessions);
}

function persistStudySessionHistory(sessions: StudySessionTelemetryRecord[]) {
  writeToStorage(STUDY_SESSIONS_STORAGE_KEY, sessions);
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

function upsertRitualRecord(
  records: AttunementRitualRecord[],
  record: AttunementRitualRecord,
): AttunementRitualRecord[] {
  const index = records.findIndex((item) => item.sessionId === record.sessionId);
  if (index === -1) {
    return [...records, record];
  }
  const next = [...records];
  next[index] = {
    ...next[index],
    ...record,
  };
  return next;
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
      levelUpMessage: null,
      isCurrentCardFlipped: false,
      activeBuffs: [],
      attunementRituals: [],
      studySessionHistory: [],
      pendingRitual: null,

      initialize: () => {
        const initialAttunementSessions = getInitialAttunementRituals();
        const initialStudySessionHistory = getInitialStudySessionHistory();
        persistAttunementRituals(initialAttunementSessions);
        persistStudySessionHistory(initialStudySessionHistory);
        const currentState = get();
        const hydratedActiveBuffs = currentState.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const activeBuffsAfterSessionEnd = BuffEngine.get().consumeForEvent(hydratedActiveBuffs, 'session_ended');
        const activeBuffs = BuffEngine.get().pruneExpired(activeBuffsAfterSessionEnd);
        set((state) => ({
          levelUpMessage: state.levelUpMessage || null,
          attunementRituals: initialAttunementSessions,
          studySessionHistory: initialStudySessionHistory,
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
        if (getRemainingRitualCooldownMs(state.attunementRituals, now) > 0) {
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

        const sessionRecord: AttunementRitualRecord = {
          sessionId,
          topicId: payload.topicId,
          startedAt: Date.now(),
          completedAt: null,
          harmonyScore,
          readinessBucket,
          checklist: payload.checklist,
          buffs,
        };

        const nextAttunementRituals = upsertRitualRecord(state.attunementRituals, sessionRecord);
        set({
          activeBuffs: normalizeActiveBuffs(state, buffs),
          attunementRituals: nextAttunementRituals,
          pendingRitual: nextPendingAttunement,
        });
        persistAttunementRituals(nextAttunementRituals);

        return {
          harmonyScore,
          readinessBucket,
          buffs,
        };
      },

      getRemainingRitualCooldownMs: (atMs) => {
        return getRemainingRitualCooldownMs(get().attunementRituals, atMs);
      },

      emitEvent: <T extends ProgressionEventType>(type: T, payload: ProgressionEventPayload<T>) => {
        if (typeof window === 'undefined') {
          return;
        }
        window.dispatchEvent(new CustomEvent(`abyss-progression-${type}`, { detail: payload }));
      },

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
        let attunementRituals = state.attunementRituals;
        if (sessionId) {
          const existingSession = state.attunementRituals.find((record) => record.sessionId === sessionId);
          if (existingSession) {
            attunementRituals = state.attunementRituals.map((record) => (
              record.sessionId === sessionId
                ? { ...record, startedAt }
                : record
            ));
          }
        }

        set({
          currentSession: {
            topicId,
            queueCardIds: queue,
            currentCardId: queue[0] ?? null,
            totalCards: queue.length,
            sessionId,
            startedAt,
            activeBuffIds,
            attempts: [],
            cardDifficultyById,
            undoStack: [],
            redoStack: [],
          },
          isCurrentCardFlipped: false,
          pendingRitual: null,
          attunementRituals,
        });
        persistAttunementRituals(attunementRituals);
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

        const undoSnapshot = captureUndoSnapshot(state);
        const nextUndoStack = trimUndoSnapshotStack([
          ...(session.undoStack || []),
          undoSnapshot,
        ]);

        const previousSM2 = state.sm2Data[cardId] || defaultSM2;
        const updatedSM2 = sm2.calculateNextReview(previousSM2, rating);
        const reward = calculateXPReward(undefined, rating);
        const activeBuffs = state.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const buffedReward = Math.max(0, Math.round(reward * BuffEngine.get().getModifierTotal('xp_multiplier', activeBuffs)));
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
          timestamp: Date.now(),
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
        let studySessionHistory = state.studySessionHistory;
        if (sessionId) {
          if (isSessionComplete) {
            const existingRecord = state.studySessionHistory.find((record) => record.sessionId === sessionId);
            const studySessionRecord: StudySessionTelemetryRecord = {
              sessionId,
              topicId: session.topicId,
              startedAt: session.startedAt ?? Date.now(),
              completedAt: Date.now(),
              attempts: nextAttempts,
              totalAttempts: sessionMetrics?.cardsCompleted ?? 0,
              cardsCompleted: sessionMetrics?.cardsCompleted ?? 0,
              avgRating: sessionMetrics?.avgRating ?? 0,
              correctRate: sessionMetrics?.correctRate ?? 0,
              sessionDurationMs: sessionMetrics?.sessionDurationMs ?? 0,
              ritualSessionId: state.attunementRituals.find((record) => record.sessionId === sessionId)?.sessionId,
            };

            studySessionHistory = existingRecord
              ? state.studySessionHistory.map((record) => (
                record.sessionId === sessionId
                  ? { ...record, ...studySessionRecord }
                  : record
              ))
              : [
                ...state.studySessionHistory,
                studySessionRecord,
              ];
          }
        }

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
          studySessionHistory,
          currentSession: {
            ...session,
            attempts: nextAttempts,
            queueCardIds: nextQueue,
            currentCardId: nextCard,
            totalCards: Math.max(session.totalCards - 1, 0),
            undoStack: nextUndoStack,
            redoStack: [],
            ...(isSessionComplete ? { startedAt: session.startedAt ?? Date.now() } : {}),
          },
          activeBuffs: nextBuffs,
          isCurrentCardFlipped: false,
        }));
        persistStudySessionHistory(studySessionHistory);
        get().emitEvent('xp-gained', {
          amount: buffedReward,
          rating,
          cardId,
          topicId: session.topicId,
        });
        if (isSessionComplete && sessionMetrics) {
          get().emitEvent('session-complete', {
            topicId: session.topicId,
            correctRate: sessionMetrics.correctRate,
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
          currentSession: {
            ...restored.currentSession,
            undoStack: nextUndoStack,
            redoStack: nextRedoStack,
          },
        });
        get().emitEvent('study-panel-history', {
          action: 'undo',
          topicId: restored.currentSession?.topicId,
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
          currentSession: {
            ...restored.currentSession,
            undoStack: nextUndoStack,
            redoStack: nextRedoStack,
          },
        });
        get().emitEvent('study-panel-history', {
          action: 'redo',
          topicId: restored.currentSession?.topicId,
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
