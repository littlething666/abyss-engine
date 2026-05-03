import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { cardRefKey, parseCardRefKey } from '@/lib/topicRef';
import { appEventBus } from '@/infrastructure/eventBus';
import { selectIsAnyModalOpen, useUIStore } from '@/store/uiStore';
import {
  applyCrystalXpDelta,
  calculateXPReward,
  calculateTopicTier,
  filterCardsByDifficulty,
  getTopicUnlockStatus,
  getTopicsByTier as computeTopicsByTier,
} from './progressionUtils';
import { calculateLevelFromXP } from '@/types/crystalLevel';
import {
  computeTrialGatedDirectReward,
  computeTrialGatedStudyReward,
  useCrystalTrialStore,
} from '@/features/crystalTrial';
import { defaultSM2, sm2, SM2Data } from './sm2';
import { Card, SubjectGraph, TopicRef } from '../../types/core';
import {
  AttunementRitualPayload,
  StudySessionAttempt,
  INITIAL_UNLOCK_POINTS,
  CoarseChoice,
  CoarseRatingResult,
  CoarseReviewMeta,
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
import { crystalCeremonyStore } from './crystalCeremonyStore';
import { resolveCoarseRating } from './coarseRating';

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
    (set, get) => {
      const submitResolvedStudyResult = (
        cardRefKeyStr: string,
        rating: Rating,
        meta?: CoarseReviewMeta,
      ) => {
        const state = get();
        const session = state.currentSession;
        if (!session || session.currentCardId !== cardRefKeyStr) {
          return;
        }
        const hasAttemptedCurrentCard = (session.attempts ?? []).some((attempt) => attempt.cardId === cardRefKeyStr);
        if (hasAttemptedCurrentCard) {
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
        // Single trial-status read at gate time. The gating helper computes
        // the capped reward and whether pregeneration should fire, so this
        // site stays decoupled from crystalTrial internals.
        const ref: TopicRef = { subjectId: session.subjectId, topicId: session.topicId };
        const previousXp = crystal.xp;
        const currentLevel = calculateLevelFromXP(previousXp);
        const trialGating = computeTrialGatedStudyReward({
          previousXp,
          rawReward: buffedReward,
          trialStatus: useCrystalTrialStore.getState().getTrialStatus(ref),
          currentLevel,
        });
        const effectiveReward = trialGating.effectiveReward;

        const applied = applyCrystalXpDelta(state.activeCrystals, ref, effectiveReward);
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
          coarseChoice: meta?.coarseChoice,
          hintUsed: meta?.hintUsed,
          appliedBucket: meta?.appliedBucket,
          timeTakenMs: meta?.timeTakenMs,
        };
        const nextAttempts = [...(session.attempts ?? []), attempt];
        const buffsAfterUsage = BuffEngine.get().consumeForEvent(activeBuffs, 'card_reviewed');
        const nextAttemptsCount = nextAttempts.length;
        const isSessionComplete = nextAttemptsCount >= session.totalCards;
        const nextBuffs = isSessionComplete
          ? BuffEngine.get().consumeForEvent(buffsAfterUsage, 'session_ended')
          : buffsAfterUsage;
        const sessionMetrics = isSessionComplete
          ? buildStudySessionMetrics(sessionId, session.topicId, nextAttempts, session.startedAt ?? now)
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
            lastCardStart: now,
          },
          activeBuffs: nextBuffs,
        });

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
          coarseChoice: meta?.coarseChoice,
          hintUsed: meta?.hintUsed,
          appliedBucket: meta?.appliedBucket,
        });

        if (applied.levelsGained > 0) {
          appEventBus.emit('crystal:leveled', {
            subjectId: session.subjectId,
            topicId: session.topicId,
            from: applied.previousLevel,
            to: applied.nextLevel,
            levelsGained: applied.levelsGained,
            sessionId,
          });
        }

        // --- Crystal Trial: pregeneration trigger ---
        // The gating helper covers both the boundary-idle case (study path)
        // and the positive-gain idle case in `shouldPregenerate`, so this
        // is a single emission point.
        if (trialGating.shouldPregenerate) {
          appEventBus.emit('crystal-trial:pregeneration-requested', {
            subjectId: ref.subjectId,
            topicId: ref.topicId,
            currentLevel,
            targetLevel: currentLevel + 1,
          });
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
      };

      const submitCoarseRating = (
        cardRefKeyStr: string,
        coarseChoice: CoarseChoice,
      ): CoarseRatingResult | null => {
        const state = get();
        const session = state.currentSession;
        if (!session || session.currentCardId !== cardRefKeyStr) {
          return null;
        }

        const now = Date.now();
        const timeTakenMs = Math.max(0, now - (session.lastCardStart ?? now));
        const { cardId } = parseCardRefKey(cardRefKeyStr);
        const hintUsed = Boolean(session.hintUsedByCardId?.[cardId]);
        const difficulty = session.cardDifficultyById?.[cardId] ?? 1;
        const resolved = resolveCoarseRating({ coarse: coarseChoice, timeTakenMs, hintUsed, difficulty });

        submitResolvedStudyResult(cardRefKeyStr, resolved.rating, {
          coarseChoice,
          hintUsed,
          appliedBucket: resolved.appliedBucket,
          timeTakenMs,
        });

        return resolved;
      };

      return {
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

        appEventBus.emit('attunement-ritual:submitted', {
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
