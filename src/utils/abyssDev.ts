/**
 * Developer tools for local debugging and manual game state control.
 */

import { uiStore } from '../store/uiStore';
import { SM2Data } from '../features/progression';
import { deckRepository } from '../infrastructure/di';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { SubjectGraph, Card } from '../types/core';

interface StoreStateLike {
  sm2Data: Record<string, SM2Data>;
  activeCrystals: Array<{ topicId: string; gridPosition: [number, number]; xp: number; spawnedAt: number }>;
  lockedTopics: string[];
  unlockPoints: number;
  currentSession: {
    queueCardIds: string[];
    currentCardId: string | null;
  } | null;
}

interface TopicCardSelection {
  topicId: string;
  cardId: string;
}

export interface AbyssDevState {
  activeCards: number;
  activeCrystals: number;
  lockedTopics: number;
  unlockPoints: number;
  queuedCards: number;
}

export interface AbyssDev {
  spawnCrystal: (topicId: string) => Promise<void>;
  makeAllCardsDue: () => void;
  setCurrentCard: (cardId: string) => Promise<void>;
  setCurrentCardByType: (cardType: Card['type']) => Promise<TopicCardSelection | null>;
  getCardByType: (cardType: Card['type']) => Promise<TopicCardSelection | null>;
  openStudyPanel: () => void;
  getState: () => AbyssDevState;
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

const abyssDev: AbyssDev = {
  spawnCrystal: async (topicId: string) => {
    const { activeCrystals } = getStore();
    if (activeCrystals.some((crystal) => crystal.topicId === topicId)) {
      console.log(`[AbyssDev] Crystal already exists for "${topicId}".`);
      return;
    }

    const allGraphs = await getAllSubjectGraphs();
    const position = useStudyStore.getState().unlockTopic(topicId, allGraphs);
    if (!position) {
      console.warn(`[AbyssDev] Could not spawn crystal for "${topicId}" (locked, missing graph data, or no slots available).`);
      return;
    }

    console.log(`[AbyssDev] Spawned crystal for "${topicId}" at position [${position[0]}, ${position[1]}]`);
  },

  makeAllCardsDue: () => {
    resetAllSM2Dates();
    console.log('[AbyssDev] All cards are now due.');
  },

  setCurrentCard: async (cardId: string) => {
    const activeTopicIds = getStore().activeCrystals.map((crystal) => crystal.topicId);

    try {
      const allGraphs = await getAllSubjectGraphs();
      const topicToSubject = collectTopicIndex(allGraphs);
      const candidates = activeTopicIds.length > 0
        ? activeTopicIds
        : Array.from(topicToSubject.keys());

      for (const topicId of candidates) {
        const subjectId = topicToSubject.get(topicId);
        if (!subjectId) {
          continue;
        }

        const cards = await deckRepository.getTopicCards(subjectId, topicId) as Card[];
        const foundCard = cards.find((card) => card.id === cardId);
        if (!foundCard) {
          continue;
        }

        useStudyStore.getState().startTopicStudySession(topicId, cards);
        const nextState = useStudyStore.getState();
        if (nextState.currentSession) {
          useStudyStore.setState({
            currentSession: {
              ...nextState.currentSession,
              currentCardId: cardId,
            },
          });
        }

        useStudyStore.setState({ isCurrentCardFlipped: false });

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
    const { sm2Data, activeCrystals, lockedTopics, unlockPoints, currentSession } = getStore();

    const state: AbyssDevState = {
      activeCards: Object.keys(sm2Data).length,
      activeCrystals: activeCrystals.length,
      lockedTopics: lockedTopics.length,
      unlockPoints,
      queuedCards: currentSession?.queueCardIds.length ?? 0,
    };

    console.log('[AbyssDev] Current state:', state);
    return state;
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
