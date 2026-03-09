import { useMemo } from 'react';

import { useProgressionStore } from '../features/progression';
import { useTopicMetadata } from '../features/content';
import { useTopicCards } from './useDeckData';
import topicSystemPromptTemplate from '../prompts/topic-system.prompt';
import { useStudySettingsStore } from '../store/studySettingsStore';
import { TARGET_AUDIENCE_OPTIONS } from '../store/studySettingsStore';
import {
  buildPriorKnowledgeLines,
  interpolatePromptTemplate,
  resolveActiveCard,
} from '../features/studyPanel';
import { toRenderableCard, type RenderableCard, type RenderableType } from '../features/studyPanel/cardPresenter';
import { normalizeSM2State, type SM2Data } from '../features/progression/sm2';
import { ActiveCrystal, Card } from '../types/core';
import { TopicMetadata } from '../features/content/selectors';

interface UseStudyPanelModelProps {
  currentCardId: string | null;
  currentTopicId: string | null;
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
  topicSystemPrompt: string;
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
  hasTheory: boolean;
  activeCrystals: ActiveCrystal[];
  unlockedTopicIds: string[];
  activeSessionId: string | null;
  activeCardType: RenderableType | null;
}

export function useStudyPanelModel({
  currentCardId,
  currentTopicId,
  totalCards,
}: UseStudyPanelModelProps): StudyPanelModel {
  const sm2Data = useProgressionStore((state) => state.sm2Data);
  const currentSession = useProgressionStore((state) => state.currentSession);
  const activeCrystals = useProgressionStore((state) => state.activeCrystals);
  const unlockedTopicIds = useProgressionStore((state) => state.unlockedTopicIds);
  const targetAudience = useStudySettingsStore((state) => state.targetAudience);

  const resolvedTopicId = useMemo(
    () => currentTopicId || currentSession?.topicId || null,
    [currentTopicId, currentSession?.topicId],
  );

  const topicMetadataTopicIds = useMemo(() => {
    const topicIds = new Set<string>();
    if (resolvedTopicId) {
      topicIds.add(resolvedTopicId);
    }
    unlockedTopicIds.forEach((topicId) => topicIds.add(topicId));
    return Array.from(topicIds);
  }, [resolvedTopicId, unlockedTopicIds]);

  const topicMetadata = useTopicMetadata(topicMetadataTopicIds);
  const resolvedTopicTheory = useMemo(
    () => topicMetadata[resolvedTopicId || '']?.theory || null,
    [resolvedTopicId, topicMetadata],
  );
  const resolvedSubject = useMemo(
    () => topicMetadata[resolvedTopicId || '']?.subjectName || 'Unknown Subject',
    [resolvedTopicId, topicMetadata],
  );
  const resolvedTopic = useMemo(
    () => topicMetadata[resolvedTopicId || '']?.topicName || 'Unknown Topic',
    [resolvedTopicId, topicMetadata],
  );
  const priorKnowledgeLines = useMemo(
    () => buildPriorKnowledgeLines(activeCrystals, unlockedTopicIds, topicMetadata),
    [activeCrystals, unlockedTopicIds, topicMetadata],
  );
  const resolvedSubjectId = useMemo(
    () => (resolvedTopicId ? topicMetadata[resolvedTopicId]?.subjectId || null : null),
    [resolvedTopicId, topicMetadata],
  );

  const topicCardQuery = useTopicCards(resolvedSubjectId || '', resolvedTopicId || '');
  const topicCards = topicCardQuery.data ?? [];
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

  const topicSystemPrompt = useMemo(
    () =>
      interpolatePromptTemplate(
        topicSystemPromptTemplate,
        {
          subject: resolvedSubject,
          topic: resolvedTopic,
          priorKnowledge: priorKnowledgeLines,
          question: currentQuestion,
          targetAudience: targetAudience || TARGET_AUDIENCE_OPTIONS[0],
        },
      ),
    [resolvedSubject, resolvedTopic, priorKnowledgeLines, currentQuestion, targetAudience],
  );

  const sm2State = useMemo(() => {
    const targetCardId = activeCard?.id || currentSession?.currentCardId || currentCardId;
    if (!targetCardId) {
      return null;
    }
    const rawSm2 = sm2Data[targetCardId];
    if (!rawSm2) {
      return null;
    }
    return normalizeSM2State(rawSm2);
  }, [activeCard?.id, currentSession?.currentCardId, currentCardId, sm2Data]);

  const isLoadingCards = !!resolvedTopicId && !!resolvedSubjectId && topicCardQuery.isLoading;
  const isCardsLoadError = !!resolvedTopicId && !!resolvedSubjectId && topicCardQuery.isError;

  const hasActiveCard = renderedCard !== null;
  const isEmptyDeck = totalCards === 0;
  const isCompleted = !hasActiveCard && !isLoadingCards && !isEmptyDeck && totalCards > 0;
  const isFlashcard = renderedCard?.type === 'flashcard';
  const isSingleChoice = renderedCard?.type === 'single_choice';
  const isMultiChoice = renderedCard?.type === 'multi_choice';
  const isChoiceQuestion = isSingleChoice || isMultiChoice;
  const hasTheory = Boolean(resolvedTopicTheory);

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
    topicSystemPrompt,
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
    hasTheory,
    activeCrystals,
    unlockedTopicIds,
    activeSessionId: currentSession?.topicId ?? null,
    activeCardType: renderedCard?.type ?? null,
  };
}
