"use client";

import React from 'react';
import { useUIStore } from '../store/uiStore';
import { calculateLevelFromXP } from '../features/progression';
import type { TopicMetadata } from '../features/content';
import type { Card } from '../types/core';

interface TopicSelectionBarProps {
  /** Whether this bar is embedded in the 3D scene (vs standalone) */
  isEmbedded?: boolean;
  onStartTopicStudySession?: (topicId: string, cards: Card[]) => void;
  onStartAttunement?: (topicId: string, cards: Card[]) => void;
  selectedMetadata?: TopicMetadata;
  selectedCards?: Card[];
  selectedXp?: number;
}

/**
 * TopicSelectionBar Component
 *
 * A small persistent bar at the top of the 3D view that shows the selected topic
 * when a crystal is selected. Displays subject name, topic name, and level.
 */
export default function TopicSelectionBar({
  isEmbedded = false,
  onStartTopicStudySession,
  onStartAttunement,
  selectedMetadata,
  selectedCards = [],
  selectedXp = 0,
}: TopicSelectionBarProps) {
  const selectedTopicId = useUIStore((state) => state.selectedTopicId);
  const selectTopic = useUIStore((state) => state.selectTopic);
  const isSelectionMode = selectedTopicId !== null;
  const xp = selectedXp;

  const topicName = selectedMetadata?.topicName || 'Selected topic';
  const subjectName = selectedMetadata?.subjectName || 'Unknown subject';
  const level = calculateLevelFromXP(xp);

  if (!isSelectionMode || !selectedTopicId) {
    return null;
  }

  const handleBegin = () => {
    if (!selectedCards?.length) {
      console.warn(`[TopicSelectionBar] No cards available for topic ${selectedTopicId}`);
      return;
    }
    if (onStartAttunement) {
      onStartAttunement(selectedTopicId, selectedCards);
      selectTopic(null);
      return;
    }
    onStartTopicStudySession?.(selectedTopicId, selectedCards);
    selectTopic(null);
  };

  const handleClear = () => {
    selectTopic(null);
  };

  const containerClass = isEmbedded ? '' : 'fixed top-4 left-1/2 -translate-x-1/2 z-50';

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2 px-2 py-2 bg-black/80 backdrop-blur-sm rounded-lg border border-white/10 shadow-lg">
        <div className="flex flex-col items-start">
          <span className="text-xs text-white/50 uppercase tracking-wider">Selected</span>
          <div className="flex items-center gap-2 text-white">
            <span className="font-semibold min-w-[100px]">{topicName}</span>
            <span className="text-white/40">•</span>
            <span className="text-sm text-amber-400 min-w-[50px]">Level {level} ({xp} XP)</span>
          </div>
        </div>

        <div className="w-px h-8 bg-white/20" />

        <button
          onClick={handleBegin}
          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded transition-colors duration-200"
        >
          Begin
        </button>

        <button
          onClick={handleClear}
          className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors duration-200"
          aria-label="Clear selection"
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
        </button>
      </div>
    </div>
  );
}
