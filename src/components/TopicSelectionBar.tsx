'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAllGraphs, useSubjects } from '@/features/content';
import { useTopicContentAvailabilityMap } from '@/hooks/useTopicContentAvailabilityMap';
import { useProgressionStore as useStudyStore } from '@/features/progression';
import type { TopicMetadata } from '@/features/content';
import type { Card } from '@/types/core';
import { useUIStore } from '@/store/uiStore';

import { LevelProgressCompact } from './LevelProgressCompact';
import { scheduleTopicDetailsDismiss, TopicDetailsPopup } from './TopicDetailsPopup';

interface TopicSelectionBarProps {
  onStartTopicStudySession?: (ref: { subjectId: string; topicId: string }, cards: Card[]) => void;
  selectedMetadata?: TopicMetadata;
  selectedCards?: Card[];
  selectedXp?: number;
}

/**
 * TopicSelectionBar Component
 *
 * A small persistent bar at the bottom of the 3D view that shows the selected topic
 * when a crystal is selected. Displays subject name, topic name, and level.
 */
export default function TopicSelectionBar({
  onStartTopicStudySession,
  selectedMetadata,
  selectedCards = [],
  selectedXp = 0,
}: TopicSelectionBarProps) {
  const selectedTopic = useUIStore((state) => state.selectedTopic);
  const selectTopic = useUIStore((state) => state.selectTopic);
  const isSelectionMode = selectedTopic !== null;
  const getDueCardsCount = useStudyStore((state) => state.getDueCardsCount);
  const getTopicsByTier = useStudyStore((state) => state.getTopicsByTier);
  const getTopicUnlockStatus = useStudyStore((state) => state.getTopicUnlockStatus);
  const unlockTopic = useStudyStore((state) => state.unlockTopic);

  const allGraphs = useAllGraphs();
  const { data: subjects = [] } = useSubjects();
  const subjectList = useMemo(
    () => subjects.map((subject) => ({ id: subject.id, name: subject.name })),
    [subjects],
  );

  const contentAvailabilityByTopicKey = useTopicContentAvailabilityMap();

  const topicsByTier = useMemo(
    () => getTopicsByTier(allGraphs, subjectList, undefined, contentAvailabilityByTopicKey),
    [getTopicsByTier, allGraphs, subjectList, contentAvailabilityByTopicKey],
  );

  const selectedTieredTopic = useMemo(() => {
    if (!selectedTopic) {
      return null;
    }
    for (const tier of topicsByTier) {
      const found = tier.topics.find(
        (t) => t.id === selectedTopic.topicId && t.subjectId === selectedTopic.subjectId,
      );
      if (found) {
        return found;
      }
    }
    return null;
  }, [selectedTopic, topicsByTier]);

  const barUnlockStatus = useMemo(() => {
    if (!selectedTopic) {
      return null;
    }
    return getTopicUnlockStatus(selectedTopic, allGraphs);
  }, [allGraphs, getTopicUnlockStatus, selectedTopic]);

  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!selectedTopic) {
      setDetailsOpen(false);
    }
  }, [selectedTopic]);

  const topicName = selectedMetadata?.topicName || 'Selected topic';
  const selectedDueCards = React.useMemo(() => {
    if (!selectedCards.length || !selectedTopic) {
      return 0;
    }
    const refs = selectedCards.map((card) => ({ id: card.id }));
    return getDueCardsCount(selectedTopic, refs);
  }, [getDueCardsCount, selectedTopic, selectedCards]);

  const handleOpenDetails = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setDetailsOpen(true);
    },
    [],
  );

  const handleUnlockFromBar = useCallback(() => {
    if (!selectedTopic || !selectedTieredTopic || !barUnlockStatus?.canUnlock) {
      return;
    }
    unlockTopic(selectedTopic, allGraphs);
    scheduleTopicDetailsDismiss(() => setDetailsOpen(false));
  }, [allGraphs, barUnlockStatus?.canUnlock, selectedTieredTopic, selectedTopic, unlockTopic]);

  if (!isSelectionMode || !selectedTopic) {
    return null;
  }

  const stopPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const handleBegin: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    stopPropagation(event);
    if (!selectedCards?.length) {
      console.warn(`[TopicSelectionBar] No cards available for topic ${selectedTopic.topicId}`);
      return;
    }
    onStartTopicStudySession?.(selectedTopic, selectedCards);
    selectTopic(null);
  };

  const handleClear: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    stopPropagation(event);
    selectTopic(null);
  };

  const showUnlockButton = Boolean(selectedTieredTopic?.isLocked);

  const containerClass = 'fixed z-50 flex justify-center px-2 sm:px-3';
  const containerStyle: React.CSSProperties = {
    left: '0.25rem',
    right: '0.25rem',
    bottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
  };

  return (
    <>
      <div className={containerClass} style={containerStyle}>
        <div className="inline-flex w-full max-w-lg items-center gap-2 rounded-lg border border-border bg-card/80 px-2 py-1.5 shadow-sm backdrop-blur-sm sm:w-auto">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="truncate text-xs font-semibold text-foreground">{topicName}</span>
              <span
                className="inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground"
                title={`${selectedDueCards} cards due`}
              >
                {selectedDueCards}
                <Layers className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                <span className="sr-only">cards due</span>
              </span>
            </div>
            <LevelProgressCompact xp={selectedXp} className="mt-0.5 max-w-full" />
          </div>

          <div className="h-6 w-px shrink-0 bg-border/60" />

          {showUnlockButton ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenDetails}
              onPointerDown={stopPropagation}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              className="h-8 shrink-0 px-3 text-xs"
            >
              Unlock
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            onClick={handleBegin}
            onPointerDown={stopPropagation}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            className="h-8 shrink-0 px-3 text-xs"
          >
            Begin
          </Button>

          <Button
            type="button"
            aria-label="Clear selection"
            onClick={handleClear}
            onPointerDown={stopPropagation}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            variant="outline"
            size="icon-sm"
            className="size-8 shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </Button>
        </div>
      </div>

      {detailsOpen && selectedTieredTopic && barUnlockStatus ? (
        <TopicDetailsPopup
          isOpen={detailsOpen}
          topic={selectedTieredTopic}
          unlockStatus={barUnlockStatus}
          onClose={() => setDetailsOpen(false)}
          onUnlock={handleUnlockFromBar}
        />
      ) : null}
    </>
  );
}
