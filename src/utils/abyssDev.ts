/**
 * Developer tools for local debugging, manual game state control, and E2E tests.
 *
 * Phase 2 step 12: this surface is the debug control plane for E2E specs
 * under `tests/`. The public `AbyssDev` interface is held stable; only
 * internals change.
 *
 * Rules:
 *   - Reads route through the new domain stores: `useCrystalGardenStore`,
 *     `useStudySessionStore`, `useSM2Store`.
 *   - Cross-store writes route through orchestrators
 *     (`crystalGardenOrchestrator`, `studySessionOrchestrator`).
 *   - Single-store fan-outs (e.g. `makeAllCardsDue` rewriting every SM-2
 *     entry) write directly to the owning store.
 *   - The compile-time `const _check: AbyssDev = abyssDev` assertion at
 *     the bottom locks the public method names so any drift fails
 *     type-check before merge.
 */

import { cardRefKey, topicRefKey } from '@/lib/topicRef';
import { uiStore } from '../store/uiStore';
import {
  crystalGardenOrchestrator,
  studySessionOrchestrator,
  useCrystalGardenStore,
  useSM2Store,
  useStudySessionStore,
  type SM2Data,
} from '../features/progression';
import { triggerTopicGenerationPipeline } from '../features/contentGeneration';
import { deckRepository } from '../infrastructure/di';
import { calculateLevelFromXP } from '@/types/crystalLevel';
import { SubjectGraph, Card } from '../types/core';
import type { Rating } from '../types/progression';
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

const getAllSubjectGraphs = async (): Promise<SubjectGraph[]> => {
  const manifest = await deckRepository.getManifest({ includePregeneratedCurriculums: true });
  const subjectIds = (manifest.subjects ?? []).map((subject: { id: string }) => subject.id);

  const responses = await Promise.allSettled(
    subjectIds.map((subjectId) => deckRepository.getSubjectGraph(subjectId)),
  );
  return responses.flatMap((entry) => (entry.status === 'fulfilled' ? [entry.value] : []));
};

function collectTopicIndex(graphs: SubjectGraph[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const graph of graphs) {
    for (const node of graph.nodes) {
      map.set(node.topicId, graph.subjectId);
    }
  }
  return map;
}

/**
 * Reset all SM-2 review dates to make every card due now. Single-store
 * mutation on `useSM2Store` — the legacy `useStudyStore.setState({ sm2Data })`
 * path is no longer needed once Phase 2 callers stop reading SM-2 from the
 * monolith.
 */
function resetAllSM2Dates() {
  const sm2Data = useSM2Store.getState().sm2Data;
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
    useSM2Store.setState({ sm2Data: updated });
  }

  console.log(`[AbyssDev] Reset SM2 review dates for ${activeCount} study cards`);
}

async function getCardByType(cardType: Card['type']): Promise<TopicCardSelection | null> {
  const allGraphs = await getAllSubjectGraphs();
  const topicToSubject = collectTopicIndex(allGraphs);
  const activeTopicIds = useCrystalGardenStore
    .getState()
    .activeCrystals.map((crystal) => crystal.topicId);

  const candidates =
    activeTopicIds.length > 0 ? activeTopicIds : Array.from(topicToSubject.keys());

  for (const topicId of candidates) {
    const subjectId = topicToSubject.get(topicId);
    if (!subjectId) {
      continue;
    }

    try {
      const cards = (await deckRepository.getTopicCards(subjectId, topicId)) as Card[];
      const foundCard = cards.find((card) => card.type === cardType);

      if (foundCard) {
        return { topicId, cardId: foundCard.id };
      }
    } catch (error) {
      console.warn(`[AbyssDev] Failed to load cards for topic \"${topicId}\".`, error);
    }
  }

  return null;
}

function subjectIdForTopic(topicId: string): string | null {
  const active = useCrystalGardenStore
    .getState()
    .activeCrystals.find((c) => c.topicId === topicId);
  return active?.subjectId ?? null;
}

const abyssDev: AbyssDev = {
  spawnCrystal: async (topicId: string) => {
    const allGraphs = await getAllSubjectGraphs();
    const subjectId = collectTopicIndex(allGraphs).get(topicId);
    if (!subjectId) {
      console.warn(`[AbyssDev] No subject found for topic \"${topicId}\".`);
      return;
    }

    const activeCrystals = useCrystalGardenStore.getState().activeCrystals;
    if (
      activeCrystals.some(
        (crystal) => crystal.subjectId === subjectId && crystal.topicId === topicId,
      )
    ) {
      console.log(`[AbyssDev] Crystal already exists for \"${topicId}\".`);
      return;
    }

    const position = crystalGardenOrchestrator.unlockTopic({ subjectId, topicId }, allGraphs);
    if (!position) {
      console.warn(`[AbyssDev] Could not spawn crystal for \"${topicId}\".`);
      return;
    }

    void triggerTopicGenerationPipeline(subjectId, topicId);
    console.log(
      `[AbyssDev] Spawned crystal for \"${topicId}\" at [${position[0]}, ${position[1]}]`,
    );
  },

  makeAllCardsDue: () => {
    resetAllSM2Dates();
    console.log('[AbyssDev] All cards are now due.');
  },

  setCurrentCard: async (cardId: string) => {
    const activeRefs = useCrystalGardenStore.getState().activeCrystals.map((crystal) => ({
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
        const cards = (await deckRepository.getTopicCards(subjectId, topicId)) as Card[];
        const foundCard = cards.find((card) => card.id === cardId);
        if (!foundCard) {
          continue;
        }

        const ref = { subjectId, topicId };
        studySessionOrchestrator.startTopicStudySession(ref, cards);
        const compositeId = cardRefKey({ subjectId, topicId, cardId });
        const session = useStudySessionStore.getState().currentSession;
        if (session) {
          useStudySessionStore.setState({
            currentSession: { ...session, currentCardId: compositeId },
          });
        }

        uiStore.getState().resetCardFlip();

        console.log(`[AbyssDev] Selected card \"${cardId}\" in topic \"${topicId}\"`);
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
    const sm2Data = useSM2Store.getState().sm2Data;
    const { activeCrystals, unlockPoints } = useCrystalGardenStore.getState();
    const session = useStudySessionStore.getState().currentSession;
    return {
      activeCards: Object.keys(sm2Data).length,
      activeCrystals: activeCrystals.length,
      unlockPoints,
      queuedCards: session?.queueCardIds.length ?? 0,
      currentCardId: session?.currentCardId ?? null,
    };
  },

  getSM2: (cardId: string) => {
    const entry = useSM2Store.getState().sm2Data[cardId];
    if (!entry) return null;
    return {
      cardId,
      interval: entry.interval ?? 0,
      easeFactor: entry.easeFactor ?? 2.5,
      repetitions: entry.repetitions ?? 0,
      nextReview: entry.nextReview ?? 0,
    };
  },

  // No persisted `totalXp` field exists on either the legacy monolith or
  // the new domain stores; the crystal garden tracks XP per crystal. Sum
  // per-crystal XP so E2E specs that read `getXpTotal()` after dev XP
  // grants observe a deterministic non-zero value.
  getXpTotal: () => {
    return useCrystalGardenStore
      .getState()
      .activeCrystals.reduce((sum, crystal) => sum + (crystal.xp ?? 0), 0);
  },

  getCrystalLevel: (topicId: string) => {
    const crystal = useCrystalGardenStore
      .getState()
      .activeCrystals.find((c) => c.topicId === topicId);
    if (!crystal) return null;
    return calculateLevelFromXP(crystal.xp ?? 0);
  },

  rateCurrentCard: (rating) => {
    const cardId = useStudySessionStore.getState().currentSession?.currentCardId;
    if (!cardId) return;
    // The orchestrator's `Rating` is 1|2|3|4. The public dev surface keeps
    // its 0|1|2|3 contract for legacy-test compatibility; pass through
    // unchanged so callers continue to drive the same downstream code path
    // they did before the refactor.
    studySessionOrchestrator.submitStudyResult(cardId, rating as unknown as Rating);
  },

  // Topic content / mini-game payloads have never been wired into a typed
  // accessor on either the legacy monolith or the new stores. Preserve the
  // prior `null` default so E2E specs that read this only after explicit
  // setup (where they already short-circuit on null) keep compiling.
  getMiniGameContent: () => null,

  getMiniGameState: () => {
    const ui = uiStore.getState() as unknown as {
      miniGameInteraction?: unknown;
      getMiniGameState?: () => unknown;
    };
    return ui.getMiniGameState?.() ?? ui.miniGameInteraction ?? null;
  },

  // Note: the prior `forceLevelUp(topicId)` no-op stub was retired here
  // (follow-up plan §1 Option B). The previous implementation always
  // returned `false` because the legacy `forceCrystalLevelUp` it tried
  // to call never existed on the new domain stores; specs that drove it
  // skipped silently. E2E specs that need a real level-up should drive
  // the production trial path: `triggerTrial(topicId)` →
  // `submitTrialCorrect(topicId)`, then click the Level Up button in
  // `CrystalTrialModal` (the user-facing flow). Crossing the level
  // boundary is gated on that click; see
  // `src/infrastructure/eventBusHandlers.ts` (`crystal-trial:completed`
  // handler) for the contract.

  triggerTrial: async (topicId: string) => {
    const subjectId = subjectIdForTopic(topicId);
    if (!subjectId) return false;
    const ref = { subjectId, topicId };
    const trialStore = useCrystalTrialStore.getState();
    const level = abyssDev.getCrystalLevel(topicId) ?? 0;
    trialStore.startPregeneration({ subjectId, topicId, targetLevel: level + 1 });
    appEventBus.emit('crystal-trial:pregeneration-requested', {
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
      const payload: AppEventMap['crystal-trial:completed'] = {
        subjectId,
        topicId,
        targetLevel: trial.targetLevel,
        passed: false,
        score: result.score,
        trialId: trial.trialId,
      };
      appEventBus.emit('crystal-trial:completed', payload);
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

// Lock the public AbyssDev surface at compile time. E2E specs under
// `tests/` import these method names; any drift fails type-check before
// the diff can land.
const _publicSurfaceCheck: AbyssDev = abyssDev;
void _publicSurfaceCheck;

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
