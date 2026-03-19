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
  const xp = selectedXp;
  const getDueCardsCount = useStudyStore((state) => state.getDueCardsCount);
  const sm2Data = useStudyStore((state) => state.sm2Data);

  const topicName = selectedMetadata?.topicName || 'Selected topic';
  const subjectName = selectedMetadata?.subjectName || 'Unknown subject';
  const level = calculateLevelFromXP(xp);
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

  const containerClass = 'fixed z-50 flex justify-center px-3';
  const containerStyle: React.CSSProperties = {
    left: '0.5rem',
    right: '0.5rem',
    bottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
  };

  return (
    <div className={containerClass} style={containerStyle}>
      <div className="inline-flex items-center gap-2 px-2 py-2 w-full sm:w-auto bg-card/80 backdrop-blur-sm rounded-lg border border-border shadow-lg">
        <div className="flex flex-col items-start">
          <span className="text-xs text-foreground/50 uppercase tracking-wider">Selected</span>
          <div className="flex items-center gap-2 text-foreground">
            <span className="font-semibold min-w-[100px]">{topicName}</span>
            <span className="text-foreground/40">•</span>
            <span className="text-sm text-muted-foreground min-w-[50px]">Level {level} ({xp} XP)</span>
          </div>
          <span className="text-xs text-muted-foreground">Due {selectedDueCards}/{selectedTotalCards}</span>
        </div>

        <div className="w-px h-8 bg-foreground/20" />

        <Button
          type="button"
          onClick={handleBegin}
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onTouchStart={stopPropagation}
          className="px-4 py-1.5 text-sm font-medium rounded transition-colors duration-200"
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
          className="p-1.5 rounded transition-colors duration-200"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
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
