"use client";

import React from 'react';
import { useUIStore } from '../store/uiStore';
import { calculateLevelFromXP, useProgressionStore as useStudyStore } from '../features/progression';
import type { TopicMetadata } from '../features/content';
import type { Card } from '../types/core';
import { Button } from '@/components/ui/button';

interface TopicSelectionBarProps {
  onStartTopicStudySession?: (topicId: string, cards: Card[]) => void;
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
  const selectedTopicId = useUIStore((state) => state.selectedTopicId);
  const selectTopic = useUIStore((state) => state.selectTopic);
  const isSelectionMode = selectedTopicId !== null;
  const getDueCardsCount = useStudyStore((state) => state.getDueCardsCount);
  const sm2Data = useStudyStore((state) => state.sm2Data);

  const topicName = selectedMetadata?.topicName || 'Selected topic';
  const subjectName = selectedMetadata?.subjectName || 'Unknown subject';
  const level = calculateLevelFromXP(selectedXp);
  const selectedDueCards = React.useMemo(() => {
    if (!selectedCards.length) {
      return 0;
    }
    const refs = selectedCards.map((card) => ({ id: card.id }));
    return getDueCardsCount ? getDueCardsCount(refs) : refs.length;
  }, [getDueCardsCount, sm2Data, selectedCards]);
  const selectedTotalCards = selectedCards.length;

  if (!isSelectionMode || !selectedTopicId) {
    return null;
  }

  const stopPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const handleBegin: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    stopPropagation(event);
    if (!selectedCards?.length) {
      console.warn(`[TopicSelectionBar] No cards available for topic ${selectedTopicId}`);
      return;
    }
    onStartTopicStudySession?.(selectedTopicId, selectedCards);
    selectTopic(null);
  };

  const handleClear: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    stopPropagation(event);
    selectTopic(null);
  };

  const containerClass =
    'fixed z-50 flex justify-center px-2 sm:px-3';
  const containerStyle: React.CSSProperties = {
    left: '0.25rem',
    right: '0.25rem',
    bottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
  };

  return (
    <div className={containerClass} style={containerStyle}>
      <div className="inline-flex w-full max-w-lg items-center gap-2 rounded-lg border border-border bg-card/80 px-2 py-1.5 shadow-sm backdrop-blur-sm sm:w-auto">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate text-xs font-semibold text-foreground">{topicName}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              Lv{level} · {selectedDueCards}/{selectedTotalCards}
            </span>
          </div>
          <p className="truncate text-[10px] text-muted-foreground">{subjectName}</p>
        </div>

        <div className="h-6 w-px shrink-0 bg-border/60" />

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
  );
}
