import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { topicRefKey } from '@/lib/topicRef';
import type { TopicRef } from '@/types/core';
import type {
  CrystalTrial,
  CrystalTrialResult,
  CrystalTrialScenarioQuestion,
  CrystalTrialStatus,
} from '@/types/crystalTrial';
import {
  COOLDOWN_CARDS_REQUIRED,
  COOLDOWN_MIN_MS,
  PASS_THRESHOLD,
} from './crystalTrialConfig';
import { evaluateTrial } from './evaluateTrial';
import { appEventBus } from '@/infrastructure/eventBus';

const STORAGE_KEY = 'abyss-crystal-trial-v2';

interface CrystalTrialState {
  /** Active trials keyed by topicRefKey */
  trials: Record<string, CrystalTrial>;
  /** Cards reviewed per topic during cooldown, keyed by topicRefKey */
  cooldownCardsReviewed: Record<string, number>;
  /** Timestamp when cooldown started per topic, keyed by topicRefKey */
  cooldownStartedAt: Record<string, number>;
}

interface CrystalTrialActions {
  getTrialStatus: (ref: TopicRef) => CrystalTrialStatus;
  getCurrentTrial: (ref: TopicRef) => CrystalTrial | null;
  startPregeneration: (params: {
    subjectId: string;
    topicId: string;
    targetLevel: number;
  }) => void;
  setTrialQuestions: (
    ref: TopicRef,
    questions: CrystalTrialScenarioQuestion[],
  ) => void;
  setTrialGenerationFailed: (ref: TopicRef) => void;
  setCardPoolHash: (ref: TopicRef, hash: string) => void;
  startTrial: (ref: TopicRef) => void;
  cancelTrialAttempt: (ref: TopicRef) => void;
  answerQuestion: (
    ref: TopicRef,
    questionId: string,
    answer: string,
  ) => void;
  submitTrial: (ref: TopicRef) => CrystalTrialResult | null;
  recordCooldownCardReview: (ref: TopicRef) => void;
  isCooldownComplete: (ref: TopicRef, now: number) => boolean;
  clearCooldown: (ref: TopicRef) => void;
  clearTrial: (ref: TopicRef) => void;
  forceCompleteWithCorrectAnswers: (ref: TopicRef) => CrystalTrialResult | null;
  /**
   * Invalidate an awaiting/pregenerating trial.
   * When regenerateParams is provided, atomically replaces the old trial
   * with a fresh pregeneration trial (avoids event dispatch race conditions).
   */
  invalidateAndRegenerate: (
    ref: TopicRef,
    regenerateParams?: { subjectId: string; topicId: string; targetLevel: number },
  ) => void;
}

type CrystalTrialStore = CrystalTrialState & CrystalTrialActions;

function makeTrial(
  subjectId: string,
  topicId: string,
  targetLevel: number,
): CrystalTrial {
  return {
    trialId: `trial-${subjectId}-${topicId}-L${targetLevel}-${Date.now()}`,
    subjectId,
    topicId,
    targetLevel,
    questions: [],
    status: 'pregeneration',
    answers: {},
    score: null,
    passThreshold: PASS_THRESHOLD,
    createdAt: Date.now(),
    completedAt: null,
    cardPoolHash: null,
  };
}

export const useCrystalTrialStore = create<CrystalTrialStore>()(
  persist(
    (set, get) => ({
      trials: {},
      cooldownCardsReviewed: {},
      cooldownStartedAt: {},

      getTrialStatus: (ref) => {
        const key = topicRefKey(ref);
        const trial = get().trials[key];
        if (!trial) {
          const cooldownStart = get().cooldownStartedAt[key];
          if (cooldownStart != null) {
            return 'cooldown';
          }
          return 'idle';
        }
        return trial.status;
      },

      getCurrentTrial: (ref) => {
        const key = topicRefKey(ref);
        return get().trials[key] ?? null;
      },

      startPregeneration: ({ subjectId, topicId, targetLevel }) => {
        const ref = { subjectId, topicId };
        const key = topicRefKey(ref);
        const existing = get().trials[key];
        if (
          existing &&
          existing.status !== 'idle' &&
          existing.status !== 'failed'
        ) {
          return;
        }
        const trial = makeTrial(subjectId, topicId, targetLevel);
        set((state) => ({
          trials: {
            ...state.trials,
            [key]: trial,
          },
        }));
      },

      setTrialQuestions: (ref, questions) => {
        const key = topicRefKey(ref);
        set((state) => {
          const trial = state.trials[key];
          if (!trial || trial.status !== 'pregeneration') {
            return {};
          }
          return {
            trials: {
              ...state.trials,
              [key]: { ...trial, questions, status: 'awaiting_player' },
            },
          };
        });
      },

      setTrialGenerationFailed: (ref) => {
        const key = topicRefKey(ref);
        set((state) => {
          const trial = state.trials[key];
          if (!trial) {
            return {};
          }
          return {
            trials: {
              ...state.trials,
              [key]: { ...trial, status: 'failed' },
            },
          };
        });
      },

      setCardPoolHash: (ref, hash) => {
        const key = topicRefKey(ref);
        set((state) => {
          const trial = state.trials[key];
          if (!trial) {
            return {};
          }
          return {
            trials: {
              ...state.trials,
              [key]: { ...trial, cardPoolHash: hash },
            },
          };
        });
      },

      startTrial: (ref) => {
        const key = topicRefKey(ref);
        set((state) => {
          const trial = state.trials[key];
          if (!trial || trial.status !== 'awaiting_player') {
            return {};
          }
          return {
            trials: {
              ...state.trials,
              [key]: { ...trial, status: 'in_progress' },
            },
          };
        });
      },

      cancelTrialAttempt: (ref) => {
        const key = topicRefKey(ref);
        set((state) => {
          const trial = state.trials[key];
          if (!trial || trial.status !== 'in_progress') {
            return {};
          }

          return {
            trials: {
              ...state.trials,
              [key]: {
                ...trial,
                status: 'awaiting_player',
                answers: {},
                score: null,
              },
            },
          };
        });
      },

      answerQuestion: (ref, questionId, answer) => {
        const key = topicRefKey(ref);
        set((state) => {
          const trial = state.trials[key];
          if (!trial || trial.status !== 'in_progress') {
            return {};
          }
          return {
            trials: {
              ...state.trials,
              [key]: {
                ...trial,
                answers: { ...trial.answers, [questionId]: answer },
              },
            },
          };
        });
      },

      submitTrial: (ref) => {
        const key = topicRefKey(ref);
        const trial = get().trials[key];
        if (!trial || trial.status !== 'in_progress') {
          return null;
        }

        const result = evaluateTrial(
          trial.questions,
          trial.answers,
          trial.passThreshold,
        );
        const now = Date.now();

        if (result.passed) {
          set((state) => ({
            trials: {
              ...state.trials,
              [key]: {
                ...trial,
                status: 'passed',
                score: result.score,
                completedAt: now,
              },
            },
          }));
        } else {
          set((state) => ({
            trials: {
              ...state.trials,
              [key]: {
                ...trial,
                status: 'cooldown',
                score: result.score,
                completedAt: now,
              },
            },
            cooldownStartedAt: {
              ...state.cooldownStartedAt,
              [key]: now,
            },
            cooldownCardsReviewed: {
              ...state.cooldownCardsReviewed,
              [key]: 0,
            },
          }));
        }

        return result;
      },

      forceCompleteWithCorrectAnswers: (ref) => {
        const key = topicRefKey(ref);
        const initialStatus = get().getTrialStatus(ref);
        if (initialStatus !== 'awaiting_player' && initialStatus !== 'in_progress') {
          return null;
        }

        if (initialStatus === 'awaiting_player') {
          get().startTrial(ref);
        }

        const preSubmitTrial = get().trials[key];
        if (!preSubmitTrial || preSubmitTrial.status !== 'in_progress') {
          return null;
        }

        if (preSubmitTrial.questions.length === 0) {
          return null;
        }

        const correctAnswers: Record<string, string> = {};
        for (const question of preSubmitTrial.questions) {
          correctAnswers[question.id] = question.correctAnswer;
        }

        set((state) => {
          const trial = state.trials[key];
          if (!trial || trial.status !== 'in_progress') {
            return {};
          }
          return {
            trials: {
              ...state.trials,
              [key]: {
                ...trial,
                answers: {
                  ...trial.answers,
                  ...correctAnswers,
                },
              },
            },
          };
        });

        const result = get().submitTrial(ref);
        if (!result) {
          return null;
        }

        const completedTrial = get().getCurrentTrial(ref);
        if (completedTrial) {
          appEventBus.emit('crystal:trial-completed', {
            subjectId: ref.subjectId,
            topicId: ref.topicId,
            targetLevel: completedTrial.targetLevel,
            passed: result.passed,
            score: result.score,
            trialId: completedTrial.trialId,
          });
        }

        return result;
      },

      recordCooldownCardReview: (ref) => {
        const key = topicRefKey(ref);
        set((state) => {
          const current = state.cooldownCardsReviewed[key] ?? 0;
          return {
            cooldownCardsReviewed: {
              ...state.cooldownCardsReviewed,
              [key]: current + 1,
            },
          };
        });
      },

      isCooldownComplete: (ref, now) => {
        const key = topicRefKey(ref);
        const state = get();
        const startedAt = state.cooldownStartedAt[key];
        if (startedAt == null) {
          return false;
        }
        const timeElapsed = now - startedAt >= COOLDOWN_MIN_MS;
        const cardsReviewed =
          (state.cooldownCardsReviewed[key] ?? 0) >= COOLDOWN_CARDS_REQUIRED;
        return timeElapsed && cardsReviewed;
      },

      clearCooldown: (ref) => {
        const key = topicRefKey(ref);
        set((state) => {
          const trial = state.trials[key];
          const { [key]: _cd, ...restCooldownStarted } = state.cooldownStartedAt;
          const { [key]: _cr, ...restCooldownCards } = state.cooldownCardsReviewed;

          if (!trial) {
            return {
              cooldownStartedAt: restCooldownStarted,
              cooldownCardsReviewed: restCooldownCards,
            };
          }

          return {
            trials: {
              ...state.trials,
              [key]: makeTrial(trial.subjectId, trial.topicId, trial.targetLevel),
            },
            cooldownStartedAt: restCooldownStarted,
            cooldownCardsReviewed: restCooldownCards,
          };
        });
      },

      clearTrial: (ref) => {
        const key = topicRefKey(ref);
        set((state) => {
          const { [key]: _removed, ...rest } = state.trials;
          return { trials: rest };
        });
      },

      invalidateAndRegenerate: (ref, regenerateParams?) => {
        const key = topicRefKey(ref);
        set((state) => {
          const trial = state.trials[key];
          if (!trial) {
            return {};
          }

          if (regenerateParams) {
            // Atomic: delete old trial + create new pregeneration trial in one update
            return {
              trials: {
                ...state.trials,
                [key]: makeTrial(
                  regenerateParams.subjectId,
                  regenerateParams.topicId,
                  regenerateParams.targetLevel,
                ),
              },
            };
          }

          // No regeneration — just delete
          const { [key]: _removed, ...rest } = state.trials;
          return { trials: rest };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({
        trials: state.trials,
        cooldownCardsReviewed: state.cooldownCardsReviewed,
        cooldownStartedAt: state.cooldownStartedAt,
      }),
    },
  ),
);
