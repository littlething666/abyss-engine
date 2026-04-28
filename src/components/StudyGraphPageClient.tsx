'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { StudyForceGraph } from '@/components/StudyForceGraph';
import StudyPanelModal from '@/components/StudyPanelModal';
import TopicSelectionBar from '@/components/TopicSelectionBar';
import { IncrementalSubjectModal } from '@/components/IncrementalSubjectModal';
import { FirstCurriculumEmptyState } from '@/components/FirstCurriculumEmptyState';
import SubjectNavigationHud from '@/components/SubjectNavigationHud';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useSubjects, useSubjectGraphs, useTopicCards, useTopicMetadata } from '@/features/content';
import { useProgressionStore } from '@/features/progression';
import { undoManager } from '@/features/progression/undoManager';
import { topicRefKey } from '@/lib/topicRef';
import {
  buildSubjectGraphsForceGraphData,
  compositeTopicNodeId,
  computeTopicGraphBfsDistances,
  getSelectableMaxHop,
  resolveEffectiveTopicGraphDistances,
} from '@/lib/subjectGraphsForceGraphData';
import { useUIStore } from '@/store/uiStore';
import type { Card } from '@/types/core';
import { CoarseChoice, type Rating } from '@/types';

export function StudyGraphPageClient() {
  const initializedRef = useRef(false);
  const initialize = useProgressionStore((s) => s.initialize);
  const startTopicStudySession = useProgressionStore((s) => s.startTopicStudySession);
  const currentSession = useProgressionStore((s) => s.currentSession);
  const submitStudyResult = useProgressionStore((s) => s.submitStudyResult);
  const submitCoarseStudyResult = useProgressionStore((s) => s.submitCoarseStudyResult);
  const advanceStudyAfterReveal = useProgressionStore((s) => s.advanceStudyAfterReveal);
  const undoLastStudyResult = useProgressionStore((s) => s.undoLastStudyResult);
  const redoLastStudyResult = useProgressionStore((s) => s.redoLastStudyResult);
  const activeCrystals = useProgressionStore((s) => s.activeCrystals);
  const unlockPoints = useProgressionStore((s) => s.unlockPoints);

  const unlockedNodeIds = useMemo(
    () => activeCrystals.map((c) => compositeTopicNodeId(c.subjectId, c.topicId)),
    [activeCrystals],
  );

  const selectedTopic = useUIStore((s) => s.selectedTopic);
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
    const { distances } = computeTopicGraphBfsDistances(full, unlockedNodeIds);
    const effective = resolveEffectiveTopicGraphDistances(full, unlockedNodeIds, distances);
    return getSelectableMaxHop(effective);
  }, [visibleGraphsForStudy, unlockedNodeIds]);

  const maxHopSelectItems = useMemo(
    () => [
      ...Array.from({ length: selectableMaxHop + 1 }, (_, i) => ({
        value: String(i),
        label:
          i === 0
            ? 'Entry topics only'
            : i === 1
              ? 'Within 1 hop'
              : `Within ${i} hops`,
      })),
      {
        value: 'all',
        label: 'Show all',
      },
    ],
    [selectableMaxHop],
  );

  useEffect(() => {
    setMaxHop((h) => (h === null ? h : Math.min(h, selectableMaxHop)));
  }, [selectableMaxHop]);

  const isLoading = subjectsQuery.isLoading || (subjectIds.length > 0 && graphsQuery.isLoading);
  const error = subjectsQuery.error ?? graphsQuery.error;

  const topicMetaById = useTopicMetadata(selectedTopic ? [selectedTopic] : []);
  const selectedTopicKey = selectedTopic ? topicRefKey(selectedTopic) : '';
  const selectedMetadata = selectedTopic ? topicMetaById[selectedTopicKey] : undefined;
  const subjectIdForSelection = selectedMetadata?.subjectId ?? '';
  const topicCardsQuery = useTopicCards(subjectIdForSelection, selectedTopic?.topicId ?? '');
  const selectedTopicCards = topicCardsQuery.data ?? [];
  const [isIncrementalSubjectOpen, setIsIncrementalSubjectOpen] = useState(false);

  const selectedTopicXp = useMemo(() => {
    if (!selectedTopic) {
      return 0;
    }
    return (
      activeCrystals.find(
        (c) => c.subjectId === selectedTopic.subjectId && c.topicId === selectedTopic.topicId,
      )?.xp ?? 0
    );
  }, [activeCrystals, selectedTopic]);

  const handleStartTopicFromBar = useCallback(
    (ref: { subjectId: string; topicId: string }, cards: Card[]) => {
      if (!cards.length) {
        return;
      }
      startTopicStudySession(ref, cards);
      openStudyPanel();
    },
    [openStudyPanel, startTopicStudySession],
  );

  const handleCloseStudyPanel = useCallback(() => {
    closeStudyPanel();
  }, [closeStudyPanel]);

  const handleCreateSubjectFromHud = useCallback(() => {
    setIsIncrementalSubjectOpen(true);
  }, []);

  const handleRate = useCallback(
    (cardId: string, isCorrect?: boolean, selfRating?: Rating) => {
      const reviewRating = selfRating ?? (isCorrect === undefined ? 3 : isCorrect ? 3 : 1);
      submitStudyResult(cardId || currentSession?.currentCardId || '', reviewRating);
    },
    [currentSession?.currentCardId, submitStudyResult],
  );

  const handleCoarseRate = useCallback(
    (cardId: string, coarseChoice: CoarseChoice) =>
      submitCoarseStudyResult(cardId || currentSession?.currentCardId || '', coarseChoice),
    [currentSession?.currentCardId, submitCoarseStudyResult],
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
          <FirstCurriculumEmptyState onGenerate={handleCreateSubjectFromHud} />
        ) : null}

        {!isLoading && !error && graphsQuery.data?.length ? (
          <>
            <div className="bg-background/80 absolute top-3 left-3 z-20 flex max-w-[min(100%,20rem)] flex-col gap-1.5 rounded-lg border border-border p-2 shadow-sm backdrop-blur-sm sm:top-4 sm:left-4">
              <Label htmlFor="study-graph-hop-select" className="text-muted-foreground text-xs font-medium">
                Topic hops from progress
              </Label>
              <Select
                items={maxHopSelectItems}
                value={maxHop === null ? 'all' : String(maxHop)}
                onValueChange={(value) => {
                  if (value === null) {
                    setMaxHop(null);
                    return;
                  }
                  setMaxHop(value === 'all' ? null : Number.parseInt(value, 10));
                }}
              >
                <SelectTrigger id="study-graph-hop-select" size="sm" className="w-full min-w-0">
                  <SelectValue placeholder="Hop depth" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {maxHopSelectItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <StudyForceGraph
              allGraphs={graphsQuery.data}
              unlockedNodeIds={unlockedNodeIds}
              activeCrystals={activeCrystals}
              unlockPoints={unlockPoints}
              selectedTopicKey={selectedTopic ? topicRefKey(selectedTopic) : null}
              onSelectTopic={(ref) => selectTopic(ref)}
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

      <SubjectNavigationHud onCreateSubject={handleCreateSubjectFromHud} />

      <IncrementalSubjectModal
        isOpen={isIncrementalSubjectOpen}
        onClose={() => setIsIncrementalSubjectOpen(false)}
      />

      <StudyPanelModal
        isOpen={isStudyPanelOpen}
        currentCardId={currentSession?.currentCardId ?? null}
        currentTopicId={currentTopicId}
        currentSubjectId={currentSession?.subjectId ?? null}
        totalCards={currentSession?.totalCards ?? 0}
        onClose={handleCloseStudyPanel}
        onSubmitResult={handleRate}
        onSubmitCoarseResult={handleCoarseRate}
        onAdvance={advanceStudyAfterReveal}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
    </div>
  );
}
