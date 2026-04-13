'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { StudyForceGraph } from '@/components/StudyForceGraph';
import StudyPanelModal from '@/components/StudyPanelModal';
import TopicSelectionBar from '@/components/TopicSelectionBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useSubjects, useSubjectGraphs, useTopicCards, useTopicMetadata } from '@/features/content';
import { useProgressionStore } from '@/features/progression';
import { undoManager } from '@/features/progression/undoManager';
import {
  buildSubjectGraphsForceGraphData,
  computeTopicGraphBfsDistances,
  getSelectableMaxHop,
  resolveEffectiveTopicGraphDistances,
} from '@/lib/subjectGraphsForceGraphData';
import { useUIStore } from '@/store/uiStore';
import type { Card } from '@/types/core';
import type { Rating } from '@/types';

export function StudyGraphPageClient() {
  const initializedRef = useRef(false);
  const initialize = useProgressionStore((s) => s.initialize);
  const startTopicStudySession = useProgressionStore((s) => s.startTopicStudySession);
  const currentSession = useProgressionStore((s) => s.currentSession);
  const flipCurrentCard = useUIStore((s) => s.flipCurrentCard);
  const submitStudyResult = useProgressionStore((s) => s.submitStudyResult);
  const undoLastStudyResult = useProgressionStore((s) => s.undoLastStudyResult);
  const redoLastStudyResult = useProgressionStore((s) => s.redoLastStudyResult);
  const isCurrentCardFlipped = useUIStore((s) => s.isCurrentCardFlipped);
  const activeCrystals = useProgressionStore((s) => s.activeCrystals);
  const unlockPoints = useProgressionStore((s) => s.unlockPoints);

  const unlockedTopicIds = useMemo(
    () => activeCrystals.map((c) => c.topicId),
    [activeCrystals],
  );

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

  const currentSubjectId = useProgressionStore((s) => s.currentSubjectId);
  const [maxHop, setMaxHop] = useState<number | null>(2);

  const visibleGraphsForStudy = useMemo(() => {
    const data = graphsQuery.data;
    if (!data?.length) {
      return [];
    }
    if (!currentSubjectId) {
      return data;
    }
    return data.filter((g) => g.subjectId === currentSubjectId);
  }, [graphsQuery.data, currentSubjectId]);

  const selectableMaxHop = useMemo(() => {
    if (!visibleGraphsForStudy.length) {
      return 2;
    }
    const full = buildSubjectGraphsForceGraphData(visibleGraphsForStudy);
    const { distances } = computeTopicGraphBfsDistances(full, unlockedTopicIds);
    const effective = resolveEffectiveTopicGraphDistances(full, unlockedTopicIds, distances);
    return getSelectableMaxHop(effective);
  }, [visibleGraphsForStudy, unlockedTopicIds]);

  useEffect(() => {
    setMaxHop((h) => (h === null ? h : Math.min(h, selectableMaxHop)));
  }, [selectableMaxHop]);

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
    if (!undoManager.canUndo) {
      return;
    }
    undoLastStudyResult();
  }, [undoLastStudyResult]);

  const handleRedo = useCallback(() => {
    if (!undoManager.canRedo) {
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
          <>
            <div className="bg-background/80 absolute top-3 left-3 z-20 flex max-w-[min(100%,20rem)] flex-col gap-1.5 rounded-lg border border-border p-2 shadow-sm backdrop-blur-sm sm:top-4 sm:left-4">
              <Label htmlFor="study-graph-hop-select" className="text-muted-foreground text-xs font-medium">
                Topic hops from progress
              </Label>
              <Select
                value={maxHop === null ? 'all' : String(maxHop)}
                onValueChange={(v) => {
                  setMaxHop(v === 'all' ? null : Number.parseInt(v, 10));
                }}
              >
                <SelectTrigger id="study-graph-hop-select" size="sm" className="w-full min-w-0">
                  <SelectValue placeholder="Hop depth" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Array.from({ length: selectableMaxHop + 1 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {i === 0
                        ? 'Entry topics only'
                        : i === 1
                          ? 'Within 1 hop'
                          : `Within ${i} hops`}
                    </SelectItem>
                  ))}
                  <SelectItem value="all">Show all</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <StudyForceGraph
              allGraphs={graphsQuery.data}
              unlockedTopicIds={unlockedTopicIds}
              activeCrystals={activeCrystals}
              unlockPoints={unlockPoints}
              selectedTopicId={selectedTopicId}
              onSelectTopic={(topicId) => selectTopic(topicId)}
              onClearSelection={() => selectTopic(null)}
              maxHop={maxHop}
              className="h-full w-full min-h-0"
            />
          </>
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
