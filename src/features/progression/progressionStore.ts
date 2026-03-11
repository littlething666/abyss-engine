import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  calculateLevelFromXP,
  calculateXPReward,
  calculateTopicTier,
  filterCardsByDifficulty,
  getTopicUnlockStatus,
  getTopicsByTier,
} from './progressionUtils';
import { defaultSM2, sm2, SM2Data } from './sm2';
import { Card, SubjectGraph } from '../../types/core';
import {
  AttunementPayload,
  AttunementSessionRecord,
  INITIAL_UNLOCK_POINTS,
  ProgressionActions,
  ProgressionState,
  Rating,
  Buff,
} from '../../types/progression';
import { BuffEngine } from './buffs/buffEngine';
import { findNextGridPosition } from './gridUtils';
import {
  buildSessionMetrics,
  calculateHarmonyScore,
  generateActiveBuffs,
  makeSessionId,
} from '../analytics/attunementMetrics';

type ProgressionStore = ProgressionState & ProgressionActions;
const PROGRESSION_STORAGE_KEY = 'abyss-progression';
const ATTUNEMENT_SESSIONS_STORAGE_KEY = `${PROGRESSION_STORAGE_KEY}-attunement-sessions`;
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

function getInitialAttunementSessions(): AttunementSessionRecord[] {
  const separateStore = readFromStorage<AttunementSessionRecord[]>(ATTUNEMENT_SESSIONS_STORAGE_KEY);
  if (Array.isArray(separateStore)) {
    return separateStore;
  }

  return [];
}

function getLatestRitualSession(records: AttunementSessionRecord[]): AttunementSessionRecord | null {
  const ritualSessions = records.filter((session) => Object.keys(session.checklist).length > 0);
  if (ritualSessions.length === 0) {
    return null;
  }

  return ritualSessions.reduce<AttunementSessionRecord | null>((latest, session) => {
    if (!latest) {
      return session;
    }
    return session.startedAt > latest.startedAt ? session : latest;
  }, null);
}

function getRemainingAttunementCooldownMs(records: AttunementSessionRecord[], atMs: number): number {
  const latestSession = getLatestRitualSession(records);
  if (!latestSession) {
    return 0;
  }
  const elapsed = atMs - latestSession.startedAt;
  const remaining = ATTUNEMENT_SUBMISSION_COOLDOWN_MS - elapsed;
  return Math.max(0, remaining);
}

function persistAttunementSessions(sessions: AttunementSessionRecord[]) {
  writeToStorage(ATTUNEMENT_SESSIONS_STORAGE_KEY, sessions);
}

interface CardWithSm2 extends Card {
  sm2: SM2Data;
}

interface SessionAttempt {
  cardId: string;
  rating: Rating;
  difficulty: number;
  timestamp: number;
  isCorrect: boolean;
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

function upsertAttunementRecord(
  records: AttunementSessionRecord[],
  record: AttunementSessionRecord,
): AttunementSessionRecord[] {
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
      lockedTopics: [],
      unlockPoints: INITIAL_UNLOCK_POINTS,
      currentSubjectId: null,
      currentSession: null,
      levelUpMessage: null,
      isCurrentCardFlipped: false,
      activeBuffs: [],
      attunementSessions: [],
      pendingAttunement: null,

      initialize: () => {
        const initialAttunementSessions = getInitialAttunementSessions();
        persistAttunementSessions(initialAttunementSessions);
        const currentState = get();
        const hydratedActiveBuffs = currentState.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const activeBuffsAfterSessionEnd = BuffEngine.get().consumeForEvent(hydratedActiveBuffs, 'session_ended');
        const activeBuffs = BuffEngine.get().pruneExpired(activeBuffsAfterSessionEnd);
        set((state) => ({
          levelUpMessage: state.levelUpMessage || null,
          attunementSessions: initialAttunementSessions,
          activeBuffs: dedupeBuffsById(activeBuffs),
        }));
      },

      setCurrentSubject: (subjectId) => set({ currentSubjectId: subjectId }),

      openAttunementForTopic: (topicId, cards) => {
        set({
          pendingAttunement: {
            topicId,
            cards,
            sessionId: makeSessionId(topicId),
          },
        });
      },

      submitAttunement: (payload) => {
        const state = get();
        const now = Date.now();
        if (getRemainingAttunementCooldownMs(state.attunementSessions, now) > 0) {
          return null;
        }

        const sessionId = state.pendingAttunement?.topicId === payload.topicId
          ? state.pendingAttunement.sessionId
          : makeSessionId(payload.topicId);
        const nextPendingAttunement = {
          topicId: payload.topicId,
          cards: [],
          sessionId,
        };
        const { harmonyScore, readinessBucket } = calculateHarmonyScore(payload.checklist);
        const buffs = generateActiveBuffs(payload);

        const sessionRecord: AttunementSessionRecord = {
          sessionId,
          topicId: payload.topicId,
          startedAt: Date.now(),
          completedAt: null,
          harmonyScore,
          readinessBucket,
          checklist: payload.checklist,
          buffs,
        };

        const nextAttunementSessions = upsertAttunementRecord(state.attunementSessions, sessionRecord);
        set({
          activeBuffs: normalizeActiveBuffs(state, buffs),
          attunementSessions: nextAttunementSessions,
          pendingAttunement: nextPendingAttunement,
        });
        persistAttunementSessions(nextAttunementSessions);

        return {
          harmonyScore,
          readinessBucket,
          buffs,
        };
      },

      getRemainingAttunementCooldownMs: (atMs) => {
        return getRemainingAttunementCooldownMs(get().attunementSessions, atMs);
      },

      clearActiveBuffs: () => set({ activeBuffs: [] }),
      clearPendingAttunement: () => set({ pendingAttunement: null }),

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
        const sessionId = state.pendingAttunement?.topicId === topicId
          ? state.pendingAttunement.sessionId
          : makeSessionId(topicId);
        const startedAt = Date.now();
        const activeBuffIds = state.activeBuffs.map((buff) => buff.buffId);
        let attunementSessions = state.attunementSessions;
        if (sessionId) {
          const existingSession = state.attunementSessions.find((record) => record.sessionId === sessionId);
          if (existingSession) {
            attunementSessions = state.attunementSessions.map((record) => (
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
          },
          isCurrentCardFlipped: false,
          pendingAttunement: null,
          attunementSessions,
        });
        persistAttunementSessions(attunementSessions);
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

        const previousSM2 = state.sm2Data[cardId] || defaultSM2;
        const updatedSM2 = sm2.calculateNextReview(previousSM2, rating);
        const reward = calculateXPReward(undefined, rating);
        const activeBuffs = state.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff));
        const buffedReward = Math.max(0, Math.round(reward * BuffEngine.get().getModifierTotal('xp_multiplier', activeBuffs)));
        const xp = crystal.xp + buffedReward;
        const difficulty = session.cardDifficultyById?.[cardId] ?? 1;
        const isCorrect = rating >= 3;
        const sessionId = session.sessionId ?? makeSessionId(session.topicId);
        const attempt: SessionAttempt = {
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
        let attunementSessions = state.attunementSessions;
        if (sessionId) {
          const existingRecord = state.attunementSessions.find((record) => record.sessionId === sessionId);
          if (isSessionComplete) {
            const metrics = buildSessionMetrics(
              sessionId,
              session.topicId,
              nextAttempts,
              session.startedAt ?? Date.now(),
            );
            if (existingRecord) {
              attunementSessions = state.attunementSessions.map((record) => {
                if (record.sessionId !== sessionId) {
                  return record;
                }
                return {
                  ...record,
                  completedAt: Date.now(),
                  totalAttempts: metrics.cardsCompleted,
                  correctRate: metrics.correctRate,
                  avgRating: metrics.avgRating,
                  sessionDurationMs: metrics.sessionDurationMs,
                  readinessBucket: record.readinessBucket || 'low',
                };
              });
            } else {
              attunementSessions = [
                ...state.attunementSessions,
                {
                  sessionId,
                  topicId: session.topicId,
                  startedAt: session.startedAt ?? Date.now(),
                  completedAt: Date.now(),
                  harmonyScore: 0,
                  readinessBucket: 'low',
                  checklist: {},
                  buffs: dedupeBuffsById(state.activeBuffs),
                  totalAttempts: metrics.cardsCompleted,
                  correctRate: metrics.correctRate,
                  avgRating: metrics.avgRating,
                  sessionDurationMs: metrics.sessionDurationMs,
                },
              ];
            }
          }
        }

        set((current) => ({
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
          attunementSessions,
          currentSession: {
            ...session,
            attempts: nextAttempts,
            queueCardIds: nextQueue,
            currentCardId: nextCard,
            totalCards: Math.max(session.totalCards - 1, 0),
            ...(isSessionComplete ? { startedAt: session.startedAt ?? Date.now() } : {}),
          },
          activeBuffs: nextBuffs,
          isCurrentCardFlipped: false,
        }));
        persistAttunementSessions(attunementSessions);
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
          lockedTopics: current.lockedTopics.filter((item) => item !== topicId),
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
        lockedTopics: state.lockedTopics,
        unlockPoints: state.unlockPoints,
        currentSubjectId: state.currentSubjectId,
        currentSession: state.currentSession,
        activeBuffs: state.activeBuffs,
        pendingAttunement: state.pendingAttunement,
      }),
    },
  ),
);
