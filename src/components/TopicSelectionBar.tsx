'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Lock, Loader2, Play, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAllGraphs, useSubjects } from '@/features/content';
import { useTopicContentAvailabilityMap } from '@/hooks/useTopicContentAvailabilityMap';
import {
  getXpToNextBandThreshold,
  isXpMaxedForCurrentLevel,
  useProgressionStore as useStudyStore,
} from '@/features/progression';
import { useCrystalTrialStore } from '@/features/crystalTrial';
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
  const resonancePoints = useStudyStore((state) => state.resonancePoints);
  const trialStatus = useCrystalTrialStore((state) =>
    selectedTopic ? state.getTrialStatus(selectedTopic) : 'idle',
  );
  const openCrystalTrial = useUIStore((state) => state.openCrystalTrial);
  const xpReadyForTrial = isXpMaxedForCurrentLevel(selectedXp);
  const xpUntilTrialReady = getXpToNextBandThreshold(selectedXp);

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

  const trialReady = trialStatus === 'awaiting_player' && xpReadyForTrial;
  const isTrialLoading = trialStatus === 'pregeneration';
  const trialDisabledText =
    trialStatus === 'awaiting_player' && !xpReadyForTrial && xpUntilTrialReady > 0
      ? `${Math.max(0, xpUntilTrialReady)} XP left`
      : null;

  const handleBeginTrial: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    stopPropagation(event);
    if (!trialReady) {
      return;
    }
    openCrystalTrial();
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
        <div className="inline-flex w-full max-w-lg flex-row flex-nowrap items-center gap-2 rounded-lg border border-border bg-card/80 px-2 py-1.5 shadow-sm backdrop-blur-sm sm:w-auto">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="truncate text-xs font-semibold text-foreground">{topicName}</span>
              <span className="inline-flex shrink-0 items-center gap-2">
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-primary"
                  title="Resonance"
                >
                  <Sparkles className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="tabular-nums">{resonancePoints}</span>
                  <span className="sr-only">Resonance points</span>
                </span>
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground"
                  title={`${selectedDueCards} cards due`}
                >
                  {selectedDueCards}
                  <Layers className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="sr-only">cards due</span>
                </span>
              </span>
            </div>
            <LevelProgressCompact xp={selectedXp} className="mt-0.5 max-w-full" />
          </div>

          <div className="h-5 w-px shrink-0 bg-border/60" />

          <div className="flex shrink-0 items-center gap-1">
            {showUnlockButton ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={handleOpenDetails}
                onPointerDown={stopPropagation}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                aria-label="Unlock topic"
                title="Unlock topic"
                className="shrink-0"
              >
                <Lock className="h-3.5 w-3.5" />
              </Button>
            ) : null}

            <Button
              type="button"
              size="icon-sm"
              onClick={handleBegin}
              onPointerDown={stopPropagation}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              aria-label="Begin study session"
              title="Begin study session"
              className="shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
            </Button>

            <Button
              type="button"
              size="icon-sm"
              variant={trialReady ? 'default' : 'secondary'}
              disabled={!trialReady || isTrialLoading}
              onClick={handleBeginTrial}
              onPointerDown={stopPropagation}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              aria-label={
                isTrialLoading
                  ? 'Generating trial'
                  : trialReady
                    ? 'Begin trial'
                    : trialDisabledText
                      ? `Trial unavailable: ${trialDisabledText}`
                    : 'Trial unavailable'
              }
              title={
                isTrialLoading
                  ? 'Generating trial questions...'
                  : trialReady
                    ? 'Begin trial'
                    : trialDisabledText
                      ? `Trial unavailable: ${trialDisabledText}`
                    : 'Trial unavailable'
              }
              className="shrink-0 disabled:opacity-60"
            >
              {isTrialLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            </Button>
            {trialDisabledText ? (
              <span className="shrink-0 text-[9px] leading-tight text-muted-foreground">
                {trialDisabledText}
              </span>
            ) : null}

            <Button
              type="button"
              aria-label="Clear selection"
              onClick={handleClear}
              onPointerDown={stopPropagation}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              variant="outline"
              size="icon-sm"
              className="shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
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
