'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { StudyForceGraph } from '@/components/StudyForceGraph';
import StudyPanelModal from '@/components/StudyPanelModal';
import TopicSelectionBar from '@/components/TopicSelectionBar';
import { useSubjects, useSubjectGraphs, useTopicCards, useTopicMetadata } from '@/features/content';
import { useProgressionStore } from '@/features/progression';
import { useUIStore } from '@/store/uiStore';
import type { Card } from '@/types/core';
import type { Rating } from '@/types';

export function StudyGraphPageClient() {
  const initializedRef = useRef(false);
  const initialize = useProgressionStore((s) => s.initialize);
  const startTopicStudySession = useProgressionStore((s) => s.startTopicStudySession);
  const currentSession = useProgressionStore((s) => s.currentSession);
  const flipCurrentCard = useProgressionStore((s) => s.flipCurrentCard);
  const submitStudyResult = useProgressionStore((s) => s.submitStudyResult);
  const undoLastStudyResult = useProgressionStore((s) => s.undoLastStudyResult);
  const redoLastStudyResult = useProgressionStore((s) => s.redoLastStudyResult);
  const isCurrentCardFlipped = useProgressionStore((s) => s.isCurrentCardFlipped);
  const unlockedTopicIds = useProgressionStore((s) => s.unlockedTopicIds);
  const activeCrystals = useProgressionStore((s) => s.activeCrystals);
  const unlockPoints = useProgressionStore((s) => s.unlockPoints);

  const selectedTopicId = useUIStore((s) => s.selectedTopicId);
  const selectTopic = useUIStore((s) => s.selectTopic);
  const openStudyPanel = useUIStore((s) => s.openStudyPanel);
  const isStudyPanelOpen = useUIStore((s) => s.isStudyPanelOpen);
  const closeStudyPanel = useUIStore((s) => s.closeStudyPanel);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      initialize();
    }
  }, [initialize]);

  const subjectsQuery = useSubjects();
  const subjectIds = useMemo(
    () => (subjectsQuery.data ?? []).map((s) => s.id),
    [subjectsQuery.data],
  );
  const graphsQuery = useSubjectGraphs(subjectIds);

  const isLoading = subjectsQuery.isLoading || (subjectIds.length > 0 && graphsQuery.isLoading);
  const error = subjectsQuery.error ?? graphsQuery.error;

  const topicMetaById = useTopicMetadata(selectedTopicId ? [selectedTopicId] : []);
  const selectedMetadata = selectedTopicId ? topicMetaById[selectedTopicId] : undefined;
  const subjectIdForSelection = selectedMetadata?.subjectId ?? '';
  const topicCardsQuery = useTopicCards(subjectIdForSelection, selectedTopicId ?? '');
  const selectedTopicCards = topicCardsQuery.data ?? [];

  const selectedTopicXp = useMemo(() => {
    if (!selectedTopicId) {
      return 0;
    }
    return activeCrystals.find((c) => c.topicId === selectedTopicId)?.xp ?? 0;
  }, [activeCrystals, selectedTopicId]);

  const handleStartTopicFromBar = useCallback(
    (topicId: string, cards: Card[]) => {
      if (!cards.length) {
        return;
      }
      startTopicStudySession(topicId, cards);
      openStudyPanel();
    },
    [openStudyPanel, startTopicStudySession],
  );

  const handleCloseStudyPanel = useCallback(() => {
    closeStudyPanel();
  }, [closeStudyPanel]);

  const handleRate = useCallback(
    (cardId: string, isCorrect?: boolean, selfRating?: Rating) => {
      const reviewRating = selfRating ?? (isCorrect === undefined ? 3 : isCorrect ? 3 : 1);
      submitStudyResult(cardId || currentSession?.currentCardId || '', reviewRating);
    },
    [currentSession?.currentCardId, submitStudyResult],
  );

  const handleUndo = useCallback(() => {
    const session = useProgressionStore.getState().currentSession;
    if ((session?.undoStack?.length ?? 0) === 0) {
      return;
    }
    undoLastStudyResult();
  }, [undoLastStudyResult]);

  const handleRedo = useCallback(() => {
    const session = useProgressionStore.getState().currentSession;
    if ((session?.redoStack?.length ?? 0) === 0) {
      return;
    }
    redoLastStudyResult();
  }, [redoLastStudyResult]);

  const currentTopicId = currentSession?.topicId ?? null;

  return (
    <div className="bg-background text-foreground fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 min-h-0">
        {error ? (
          <div
            className="text-destructive absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-sm"
            role="alert"
          >
            {error.message}
          </div>
        ) : null}

        {isLoading ? (
          <div className="text-muted-foreground absolute inset-0 z-10 flex items-center justify-center text-sm">
            Loading curriculum graphs…
          </div>
        ) : null}

        {!isLoading && !error && subjectIds.length === 0 ? (
          <div className="text-muted-foreground absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-sm">
            No subjects in the manifest yet.
          </div>
        ) : null}

        {!isLoading && !error && graphsQuery.data?.length ? (
          <StudyForceGraph
            allGraphs={graphsQuery.data}
            unlockedTopicIds={unlockedTopicIds}
            activeCrystals={activeCrystals}
            unlockPoints={unlockPoints}
            selectedTopicId={selectedTopicId}
            onSelectTopic={(topicId) => selectTopic(topicId)}
            onClearSelection={() => selectTopic(null)}
            className="h-full w-full min-h-0"
          />
        ) : null}
      </div>

      <TopicSelectionBar
        onStartTopicStudySession={handleStartTopicFromBar}
        selectedMetadata={selectedMetadata}
        selectedCards={selectedTopicCards}
        selectedXp={selectedTopicXp}
      />

      <StudyPanelModal
        isOpen={isStudyPanelOpen}
        currentCardId={currentSession?.currentCardId ?? null}
        currentTopicId={currentTopicId}
        isCardFlipped={isCurrentCardFlipped}
        totalCards={currentSession?.totalCards ?? 0}
        onClose={handleCloseStudyPanel}
        onFlip={flipCurrentCard}
        onSubmitResult={handleRate}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
    </div>
  );
}
