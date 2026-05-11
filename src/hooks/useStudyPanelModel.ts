import { useMemo } from 'react';

import { cardRefKey, topicRefKey } from '@/lib/topicRef';
import {
  normalizeSM2State,
  type SM2Data,
  useCrystalGardenStore,
  useSM2Store,
  useStudySessionStore,
} from '../features/progression';
import { useTopicMetadata } from '../features/content';
import { useTopicCards } from './useDeckData';
import { useTopicContentStatusMap } from './useTopicContentStatusMap';
import {
  buildPriorKnowledgeLines,
  resolveActiveCard,
} from '../features/studyPanel';
import { toRenderableCard, type RenderableCard, type RenderableType } from '../features/studyPanel/cardPresenter';
import { undoManager } from '../features/progression/undoManager';
import { ActiveCrystal, Card, TopicRef } from '../types/core';
import { TopicMetadata } from '../features/content/selectors';

interface UseStudyPanelModelProps {
  currentCardId: string | null;
  currentTopicId: string | null;
  currentSubjectId: string | null;
  totalCards: number;
}

export interface StudyPanelModel {
  resolvedTopicId: string | null;
  resolvedSubjectId: string | null;
  resolvedSubject: string;
  resolvedTopic: string;
  resolvedTopicTheory: string | null;
  topicMetadata: Record<string, TopicMetadata>;
  priorKnowledgeLines: string;
  topicCards: Card[];
  activeCard: Card | null;
  renderedCard: RenderableCard | null;
  currentQuestion: string;
  sm2State: SM2Data | null;
  isLoadingCards: boolean;
  isCardsLoadError: boolean;
  isEmptyDeck: boolean;
  hasActiveCard: boolean;
  isCompleted: boolean;
  isFlashcard: boolean;
  isSingleChoice: boolean;
  isMultiChoice: boolean;
  isChoiceQuestion: boolean;
  isMiniGame: boolean;
  hasTheory: boolean;
  activeCrystals: ActiveCrystal[];
  unlockedTopicKeys: string[];
  activeSessionId: string | null;
  activeCardType: RenderableType | null;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
}

export function useStudyPanelModel({
  currentCardId,
  currentTopicId,
  currentSubjectId,
  totalCards,
}: UseStudyPanelModelProps): StudyPanelModel {
  // Phase 2 step 10 (round 3): the three primitive reads needed by this hook
  // each flow through their domain store directly. The plan explicitly allows
  // this hook to read from multiple stores (single exception to the
  // one-store-per-hook rule, see refactor plan section 5).
  //
  // Phase 4 prep: `normalizeSM2State` and `SM2Data` are now imported through
  // the `@/features/progression` barrel rather than the soon-to-be-deleted
  // root-level `sm2.ts` file.
  const sm2Data = useSM2Store((state) => state.sm2Data);
  const currentSession = useStudySessionStore((state) => state.currentSession);
  const activeCrystals = useCrystalGardenStore((state) => state.activeCrystals);
  const unlockedTopicKeys = useMemo(
    () => activeCrystals.map((c) => topicRefKey({ subjectId: c.subjectId, topicId: c.topicId })),
    [activeCrystals],
  );
  const resolvedTopicRef = useMemo((): TopicRef | null => {
    if (currentSubjectId && currentTopicId) {
      return { subjectId: currentSubjectId, topicId: currentTopicId };
    }
    if (currentSession) {
      return { subjectId: currentSession.subjectId, topicId: currentSession.topicId };
    }
    return null;
  }, [currentSubjectId, currentTopicId, currentSession]);

  const topicRefs = useMemo((): TopicRef[] => {
    const out: TopicRef[] = [];
    const seen = new Set<string>();
    const add = (r: TopicRef | null) => {
      if (!r?.subjectId || !r.topicId) return;
      const k = topicRefKey(r);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(r);
    };
    add(resolvedTopicRef);
    for (const c of activeCrystals) {
      add({ subjectId: c.subjectId, topicId: c.topicId });
    }
    return out;
  }, [resolvedTopicRef, activeCrystals]);

  const topicMetadata = useTopicMetadata(topicRefs);

  const metaKey = resolvedTopicRef ? topicRefKey(resolvedTopicRef) : '';
  const contentStatusByTopicKey = useTopicContentStatusMap();

  const resolvedTopicTheory = useMemo(
    () => (metaKey ? topicMetadata[metaKey]?.theory || null : null),
    [metaKey, topicMetadata],
  );
  const resolvedSubject = useMemo(
    () => (metaKey ? topicMetadata[metaKey]?.subjectName || 'Unknown Subject' : 'Unknown Subject'),
    [metaKey, topicMetadata],
  );
  const resolvedTopic = useMemo(
    () => (metaKey ? topicMetadata[metaKey]?.topicName || 'Unknown Topic' : 'Unknown Topic'),
    [metaKey, topicMetadata],
  );
  const priorKnowledgeLines = useMemo(
    () => buildPriorKnowledgeLines(activeCrystals, topicMetadata),
    [activeCrystals, topicMetadata],
  );
  const resolvedSubjectId = useMemo(
    () => (metaKey ? topicMetadata[metaKey]?.subjectId || null : null),
    [metaKey, topicMetadata],
  );

  const resolvedTopicId = resolvedTopicRef?.topicId ?? null;

  const selectedTopicContentStatus = metaKey ? contentStatusByTopicKey[metaKey] ?? 'unavailable' : 'unavailable';
  const topicCardQuery = useTopicCards(resolvedSubjectId || '', resolvedTopicId || '', selectedTopicContentStatus === 'ready');
  const topicCards = selectedTopicContentStatus === 'ready' ? topicCardQuery.data ?? [] : [];
  const activeCard = useMemo(
    () => resolveActiveCard(topicCards, currentSession?.currentCardId, currentCardId),
    [currentSession?.currentCardId, currentCardId, topicCards],
  );

  const renderedCard = useMemo(() => (activeCard ? toRenderableCard(activeCard) : null), [activeCard]);
  const currentQuestion = useMemo(() => {
    if (!activeCard) return 'unknown';
    if (activeCard.type === 'FLASHCARD') {
      return (activeCard.content as { front: string }).front ?? 'unknown';
    }
    return (activeCard.content as { question: string }).question ?? 'unknown';
  }, [activeCard]);

  const sm2State = useMemo(() => {
    if (!resolvedTopicRef || !activeCard) {
      return null;
    }
    const key = cardRefKey({ ...resolvedTopicRef, cardId: activeCard.id });
    const rawSm2 = sm2Data[key];
    if (!rawSm2) {
      return null;
    }
    return normalizeSM2State(rawSm2);
  }, [activeCard, resolvedTopicRef, sm2Data]);

  const isLoadingCards = !!resolvedTopicId && !!resolvedSubjectId && topicCardQuery.isLoading;
  const isCardsLoadError = !!resolvedTopicId && !!resolvedSubjectId && topicCardQuery.isError;

  const hasActiveCard = renderedCard !== null;
  const isEmptyDeck = totalCards === 0;
  const isCompleted = !hasActiveCard && !isLoadingCards && !isEmptyDeck && totalCards > 0;
  const isFlashcard = renderedCard?.type === 'flashcard';
  const isSingleChoice = renderedCard?.type === 'single_choice';
  const isMultiChoice = renderedCard?.type === 'multi_choice';
  const isMiniGame = renderedCard?.type === 'mini_game';
  const isChoiceQuestion = isSingleChoice || isMultiChoice;
  const hasTheory = Boolean(resolvedTopicTheory);
  const undoCount = undoManager.undoStackSize;
  const redoCount = undoManager.redoStackSize;
  const canUndo = undoCount > 0;
  const canRedo = redoCount > 0;

  return {
    resolvedTopicId,
    resolvedSubjectId,
    resolvedSubject,
    resolvedTopic,
    resolvedTopicTheory,
    topicMetadata,
    priorKnowledgeLines,
    topicCards,
    activeCard,
    renderedCard,
    currentQuestion,
    sm2State,
    isLoadingCards,
    isCardsLoadError,
    isEmptyDeck,
    hasActiveCard,
    isCompleted,
    isFlashcard,
    isSingleChoice,
    isMultiChoice,
    isChoiceQuestion,
    isMiniGame,
    hasTheory,
    activeCrystals,
    unlockedTopicKeys,
    activeSessionId: currentSession?.sessionId ?? null,
    activeCardType: renderedCard?.type ?? null,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
  };
}
