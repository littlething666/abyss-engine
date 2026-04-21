/**
 * Developer tools for local debugging, manual game state control, and E2E tests.
 *
 * Extended in feat/e2e-3d-scene-and-flows with SM-2 / XP / crystal / trial
 * helpers used by Playwright specs under `tests/`. Additions are guarded to
 * no-op gracefully when the underlying store shape changes.
 */

import { cardRefKey, topicRefKey } from '@/lib/topicRef';
import { uiStore } from '../store/uiStore';
import { SM2Data } from '../features/progression';
import { triggerTopicGenerationPipeline } from '../features/contentGeneration';
import { deckRepository } from '../infrastructure/di';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { SubjectGraph, Card } from '../types/core';
import { appEventBus, type AppEventMap } from '../infrastructure/eventBus';
import { useCrystalTrialStore } from '../features/crystalTrial/crystalTrialStore';
import {
  playLevelUpSound,
  playPositiveSound,
  playTimerFinishedSound,
  playSproutSound,
  playVictoryFanfare,
  playTuturuSound,
} from './sound';

interface StoreStateLike {
  sm2Data: Record<string, SM2Data>;
  activeCrystals: Array<{
    subjectId: string;
    topicId: string;
    gridPosition: [number, number];
    xp: number;
    spawnedAt: number;
  }>;
  unlockPoints: number;
  currentSession: {
    queueCardIds: string[];
    currentCardId: string | null;
    subjectId?: string;
    topicId?: string;
  } | null;
}

interface TopicCardSelection {
  topicId: string;
  cardId: string;
}

export interface AbyssDevState {
  activeCards: number;
  activeCrystals: number;
  unlockPoints: number;
  queuedCards: number;
  currentCardId: string | null;
}

export interface AbyssDevSm2Snapshot {
  cardId: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReview: number;
}

export interface AbyssDev {
  spawnCrystal: (topicId: string) => Promise<void>;
  makeAllCardsDue: () => void;
  setCurrentCard: (cardId: string) => Promise<void>;
  setCurrentCardByType: (cardType: Card['type']) => Promise<TopicCardSelection | null>;
  getCardByType: (cardType: Card['type']) => Promise<TopicCardSelection | null>;
  openStudyPanel: () => void;
  getState: () => AbyssDevState;
  /** E2E helpers — safe in prod, no-ops if the underlying hook is unavailable. */
  getSM2: (cardId: string) => AbyssDevSm2Snapshot | null;
  getXpTotal: () => number;
  getCrystalLevel: (topicId: string) => number | null;
  rateCurrentCard: (rating: 0 | 1 | 2 | 3) => void;
  getMiniGameContent: () => unknown | null;
  getMiniGameState: () => unknown | null;
  forceLevelUp: (topicId: string) => Promise<boolean>;
  triggerTrial: (topicId: string) => Promise<boolean>;
  submitTrialCorrect: (topicId: string) => Promise<unknown>;
  submitTrialWrong: (topicId: string) => Promise<unknown>;
  getTrialStatus: (topicId: string) => string | null;
  skipTrialCooldown: (topicId: string) => void;
  sounds: {
    playPositiveSound: () => void;
    playLevelUpSound: () => void;
    playTimerFinishedSound: () => void;
    playVictoryFanfare: () => void;
    playSproutSound: () => void;
    playTuturuSound: () => void;
  };
}

function getStore() {
  return useStudyStore.getState() as StoreStateLike;
}

const getAllSubjectGraphs = async (): Promise<SubjectGraph[]> => {
  const manifest = await deckRepository.getManifest();
  const subjectIds = (manifest.subjects ?? []).map((subject: { id: string }) => subject.id);

  const responses = await Promise.allSettled(subjectIds.map((subjectId) => deckRepository.getSubjectGraph(subjectId)));
  return responses
    .flatMap((entry) => (entry.status === 'fulfilled' ? [entry.value] : []));
};

/**
 * Reset all SM2 dates to make all cards due now.
 */
function resetAllSM2Dates() {
  const { sm2Data } = getStore();
  const updated: Record<string, SM2Data> = {};
  const activeCount = Object.keys(sm2Data).length;

  for (const [cardId, state] of Object.entries(sm2Data)) {
    updated[cardId] = {
      ...state,
      interval: state.interval ?? 0,
      easeFactor: state.easeFactor ?? 2.5,
      repetitions: state.repetitions ?? 0,
      nextReview: Date.now(),
    };
  }

  if (activeCount > 0) {
    useStudyStore.setState({ sm2Data: updated });
  }

  console.log(`[AbyssDev] Reset SM2 review dates for ${activeCount} study cards`);
}

function collectTopicIndex(graphs: SubjectGraph[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const graph of graphs) {
    for (const node of graph.nodes) {
      map.set(node.topicId, graph.subjectId);
    }
  }
  return map;
}

async function getCardByType(cardType: Card['type']): Promise<TopicCardSelection | null> {
  const allGraphs = await getAllSubjectGraphs();
  const topicToSubject = collectTopicIndex(allGraphs);
  const activeTopicIds = getStore().activeCrystals.map((crystal) => crystal.topicId);

  const candidates = activeTopicIds.length > 0
    ? activeTopicIds
    : Array.from(topicToSubject.keys());

  for (const topicId of candidates) {
    const subjectId = topicToSubject.get(topicId);
    if (!subjectId) {
      continue;
    }

    try {
      const cards = await deckRepository.getTopicCards(subjectId, topicId) as Card[];
      const foundCard = cards.find((card) => card.type === cardType);

      if (foundCard) {
        return { topicId, cardId: foundCard.id };
      }
    } catch (error) {
      console.warn(`[AbyssDev] Failed to load cards for topic "${topicId}".`, error);
    }
  }

  return null;
}

function subjectIdForTopic(topicId: string, activeOnly = true): string | null {
  const { activeCrystals } = getStore();
  const active = activeCrystals.find((c) => c.topicId === topicId);
  if (active) return active.subjectId;
  if (activeOnly) return null;
  return null;
}

const abyssDev: AbyssDev = {
  spawnCrystal: async (topicId: string) => {
    const allGraphs = await getAllSubjectGraphs();
    const subjectId = collectTopicIndex(allGraphs).get(topicId);
    if (!subjectId) {
      console.warn(`[AbyssDev] No subject found for topic "${topicId}".`);
      return;
    }

    const { activeCrystals } = getStore();
    if (activeCrystals.some((crystal) => crystal.subjectId === subjectId && crystal.topicId === topicId)) {
      console.log(`[AbyssDev] Crystal already exists for "${topicId}".`);
      return;
    }

    const position = useStudyStore.getState().unlockTopic({ subjectId, topicId }, allGraphs);
    if (!position) {
      console.warn(`[AbyssDev] Could not spawn crystal for "${topicId}".`);
      return;
    }

    void triggerTopicGenerationPipeline(subjectId, topicId);
    console.log(`[AbyssDev] Spawned crystal for "${topicId}" at [${position[0]}, ${position[1]}]`);
  },

  makeAllCardsDue: () => {
    resetAllSM2Dates();
    console.log('[AbyssDev] All cards are now due.');
  },

  setCurrentCard: async (cardId: string) => {
    const activeRefs = getStore().activeCrystals.map((crystal) => ({
      subjectId: crystal.subjectId,
      topicId: crystal.topicId,
    }));

    try {
      const allGraphs = await getAllSubjectGraphs();
      const topicToSubject = collectTopicIndex(allGraphs);
      const candidates =
        activeRefs.length > 0
          ? activeRefs
          : Array.from(topicToSubject, ([tid, sid]) => ({ subjectId: sid, topicId: tid }));

      for (const { subjectId, topicId } of candidates) {
        const cards = await deckRepository.getTopicCards(subjectId, topicId) as Card[];
        const foundCard = cards.find((card) => card.id === cardId);
        if (!foundCard) {
          continue;
        }

        const ref = { subjectId, topicId };
        useStudyStore.getState().startTopicStudySession(ref, cards);
        const nextState = useStudyStore.getState();
        const compositeId = cardRefKey({ subjectId, topicId, cardId });
        if (nextState.currentSession) {
          useStudyStore.setState({
            currentSession: {
              ...nextState.currentSession,
              currentCardId: compositeId,
            },
          });
        }

        uiStore.getState().resetCardFlip();

        console.log(`[AbyssDev] Selected card "${cardId}" in topic "${topicId}"`);
        return;
      }

      console.warn(`[AbyssDev] Card not found for ID: ${cardId}`);
    } catch (error) {
      console.warn('[AbyssDev] Failed to resolve card by ID.', error);
    }
  },

  setCurrentCardByType: async (cardType: Card['type']) => {
    const selection = await getCardByType(cardType);
    if (!selection) {
      console.warn(`[AbyssDev] No card found for type: ${cardType}`);
      return null;
    }
    await abyssDev.setCurrentCard(selection.cardId);
    return selection;
  },

  getCardByType: async (cardType: Card['type']) => {
    return getCardByType(cardType);
  },

  openStudyPanel: () => {
    uiStore.getState().openStudyPanel();
    console.log('[AbyssDev] Study panel opened');
  },

  getState: (): AbyssDevState => {
    const { sm2Data, activeCrystals, unlockPoints, currentSession } = getStore();
    return {
      activeCards: Object.keys(sm2Data).length,
      activeCrystals: activeCrystals.length,
      unlockPoints,
      queuedCards: currentSession?.queueCardIds.length ?? 0,
      currentCardId: currentSession?.currentCardId ?? null,
    };
  },

  getSM2: (cardId: string) => {
    const entry = getStore().sm2Data[cardId];
    if (!entry) return null;
    return {
      cardId,
      interval: entry.interval ?? 0,
      easeFactor: entry.easeFactor ?? 2.5,
      repetitions: entry.repetitions ?? 0,
      nextReview: entry.nextReview ?? 0,
    };
  },

  getXpTotal: () => {
    const store = useStudyStore.getState() as unknown as { totalXp?: number };
    return typeof store.totalXp === 'number' ? store.totalXp : 0;
  },

  getCrystalLevel: (topicId: string) => {
    const crystal = getStore().activeCrystals.find((c) => c.topicId === topicId);
    if (!crystal) return null;
    const store = useStudyStore.getState() as unknown as {
      getCrystalLevel?: (ref: { subjectId: string; topicId: string }) => number;
    };
    if (typeof store.getCrystalLevel === 'function') {
      return store.getCrystalLevel({ subjectId: crystal.subjectId, topicId });
    }
    return Math.max(0, Math.floor((crystal.xp ?? 0) / 100));
  },

  rateCurrentCard: (rating) => {
    const store = useStudyStore.getState() as unknown as {
      submitStudyResult?: (cardId: string, rating: number) => void;
    };
    const cardId = getStore().currentSession?.currentCardId;
    if (!cardId || !store.submitStudyResult) return;
    store.submitStudyResult(cardId, rating);
  },

  getMiniGameContent: () => {
    const session = getStore().currentSession;
    if (!session?.currentCardId) return null;
    const store = useStudyStore.getState() as unknown as {
      currentCardContent?: unknown;
      getCurrentCardContent?: () => unknown;
    };
    return store.getCurrentCardContent?.() ?? store.currentCardContent ?? null;
  },

  getMiniGameState: () => {
    const store = uiStore.getState() as unknown as {
      miniGameInteraction?: unknown;
      getMiniGameState?: () => unknown;
    };
    return store.getMiniGameState?.() ?? store.miniGameInteraction ?? null;
  },

  forceLevelUp: async (topicId: string) => {
    const subjectId = subjectIdForTopic(topicId);
    if (!subjectId) return false;
    const store = useStudyStore.getState() as unknown as {
      forceCrystalLevelUp?: (ref: { subjectId: string; topicId: string }) => boolean | Promise<boolean>;
    };
    if (typeof store.forceCrystalLevelUp !== 'function') {
      console.warn('[AbyssDev] forceCrystalLevelUp not available on progression store.');
      return false;
    }
    return Boolean(await store.forceCrystalLevelUp({ subjectId, topicId }));
  },

  triggerTrial: async (topicId: string) => {
    const subjectId = subjectIdForTopic(topicId);
    if (!subjectId) return false;
    const ref = { subjectId, topicId };
    const trialStore = useCrystalTrialStore.getState();
    const level = abyssDev.getCrystalLevel(topicId) ?? 0;
    trialStore.startPregeneration({ subjectId, topicId, targetLevel: level + 1 });
    appEventBus.emit('crystal:trial-pregenerate', {
      subjectId,
      topicId,
      currentLevel: level,
      targetLevel: level + 1,
    });
    trialStore.setTrialQuestions(ref, [
      {
        id: 'q1',
        category: 'troubleshooting',
        scenario: 'E2E placeholder scenario',
        question: 'Pick the stable option.',
        options: ['correct', 'wrong', 'maybe', 'skip'],
        correctAnswer: 'correct',
        explanation: 'Generated by abyssDev.triggerTrial for E2E testing.',
        sourceCardSummaries: ['E2E concept'],
      },
    ]);
    trialStore.startTrial(ref);
    return true;
  },

  submitTrialCorrect: async (topicId: string) => {
    const subjectId = subjectIdForTopic(topicId);
    if (!subjectId) return null;
    const ref = { subjectId, topicId };
    return useCrystalTrialStore.getState().forceCompleteWithCorrectAnswers(ref);
  },

  submitTrialWrong: async (topicId: string) => {
    const subjectId = subjectIdForTopic(topicId);
    if (!subjectId) return null;
    const ref = { subjectId, topicId };
    const trialStore = useCrystalTrialStore.getState();
    const trial = trialStore.getCurrentTrial(ref);
    if (!trial) return null;
    for (const q of trial.questions) {
      trialStore.answerQuestion(ref, q.id, q.correctAnswer === 'correct' ? 'wrong' : 'correct');
    }
    const result = trialStore.submitTrial(ref);
    if (result) {
      const payload: AppEventMap['crystal:trial-completed'] = {
        subjectId,
        topicId,
        targetLevel: trial.targetLevel,
        passed: false,
        score: result.score,
        trialId: trial.trialId,
      };
      appEventBus.emit('crystal:trial-completed', payload);
    }
    return result;
  },

  getTrialStatus: (topicId: string) => {
    const subjectId = subjectIdForTopic(topicId);
    if (!subjectId) return null;
    return useCrystalTrialStore.getState().getTrialStatus({ subjectId, topicId });
  },

  skipTrialCooldown: (topicId: string) => {
    const subjectId = subjectIdForTopic(topicId);
    if (!subjectId) return;
    const ref = { subjectId, topicId };
    const key = topicRefKey(ref);
    useCrystalTrialStore.setState((state) => {
      const { [key]: _cd, ...restCd } = state.cooldownStartedAt;
      const { [key]: _cr, ...restCr } = state.cooldownCardsReviewed;
      return { cooldownStartedAt: restCd, cooldownCardsReviewed: restCr };
    });
  },

  sounds: {
    playPositiveSound,
    playLevelUpSound,
    playTimerFinishedSound,
    playSproutSound,
    playVictoryFanfare,
    playTuturuSound,
  },
};

/**
 * Initialize and expose abyssDev to window.
 */
export function initAbyssDev() {
  (window as any).abyssDev = abyssDev;

  console.log(`
    🔧 AbyssDev loaded.
  `);

  return abyssDev;
}

export default abyssDev;
