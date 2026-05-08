'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Lock, Loader2, Play, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ParticlesAnimation, RITUAL_PARTICLE_ANIMATION } from '@/components/ui/particles-animation';
import { useAllGraphs, useSubjects } from '@/features/content';
import { useTopicContentStatusMap } from '@/hooks/useTopicContentStatusMap';
import type { TopicContentStatus } from '@/types/progression';
import { topicRefKey } from '@/lib/topicRef';
import {
  activeTopicContentGenerationLabel,
  triggerTopicGenerationPipeline,
  useContentGenerationStore,
} from '@/features/contentGeneration';
import {
  crystalGardenOrchestrator,
  getXpToNextBandThreshold,
  useCrystalGardenStore,
  useDueCardsCount,
  useTopicsByTier,
  useTopicUnlockStatus,
} from '@/features/progression';
import {
  isCrystalTrialAvailableForPlayer,
  useCrystalTrialStore,
} from '@/features/crystalTrial';
import type { TopicMetadata } from '@/features/content';
import type { Card, TopicRef } from '@/types/core';
import { useCrystalContentCelebrationStore } from '@/store/crystalContentCelebrationStore';
import { useUIStore } from '@/store/uiStore';

import { LevelProgressCompact } from './LevelProgressCompact';
import { TopicDetailsPopup } from './TopicDetailsPopup';
import { TopicIcon } from './topicIcons/TopicIcon';

interface TopicSelectionBarProps {
  onStartTopicStudySession?: (ref: { subjectId: string; topicId: string }, cards: Card[]) => void;
  selectedMetadata?: TopicMetadata;
  selectedCards?: Card[];
  selectedXp?: number;
}

/**
 * Sentinel ref used to keep the hook order stable while `selectedTopic` is
 * null. The topic-unlocking policy returns a default `canUnlock: false`
 * status for an unknown ref, and `useDueCardsCount` returns 0 against an
 * empty card list, so the sentinel produces no observable side effects —
 * downstream `useMemo`s gate the value on `selectedTopic` before use.
 */
const SENTINEL_TOPIC_REF: TopicRef = { subjectId: '', topicId: '' };

/**
 * TopicSelectionBar Component
 *
 * A small persistent bar at the bottom of the 3D view that shows the selected topic
 * when a crystal is selected. Displays subject name, topic name, and level.
 *
 * Phase 2 step 10 (TopicSelectionBar follow-up): the four computed reads /
 * writer that previously routed through the legacy progressionStore now flow
 * through the new hook trio + crystal-garden orchestrator:
 *   - `useTopicsByTier`        replaces `getTopicsByTier`
 *   - `useTopicUnlockStatus`   replaces `getTopicUnlockStatus`
 *   - `useDueCardsCount`       replaces `getDueCardsCount`
 *   - `crystalGardenOrchestrator.unlockTopic` replaces `unlockTopic`
 *
 * `useTopicUnlockStatus` and `useDueCardsCount` need a ref even when no topic
 * is selected (we cannot call hooks conditionally); we pass `SENTINEL_TOPIC_REF`
 * and gate the consumed values on `selectedTopic` in the dependent memos.
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
  const resonancePoints = useCrystalGardenStore((state) => state.resonancePoints);
  const trialStatus = useCrystalTrialStore((state) =>
    selectedTopic ? state.getTrialStatus(selectedTopic) : 'idle',
  );
  const openCrystalTrial = useUIStore((state) => state.openCrystalTrial);
  // Single source of truth for the trial-availability predicate, shared
  // with Crystals.tsx (VFX), CrystalTrialModal.tsx (Begin Trial enable),
  // and eventBusHandlers.ts (mentor watcher).
  const trialAvailable = isCrystalTrialAvailableForPlayer(trialStatus, selectedXp);
  const xpUntilTrialReady = getXpToNextBandThreshold(selectedXp);

  const allGraphs = useAllGraphs();
  const { data: subjects = [] } = useSubjects();
  const subjectList = useMemo(
    () => subjects.map((subject) => ({ id: subject.id, name: subject.name })),
    [subjects],
  );

  const contentStatusMap = useTopicContentStatusMap();

  const topicsByTier = useTopicsByTier(allGraphs, subjectList, undefined, contentStatusMap);

  const refForHooks = selectedTopic ?? SENTINEL_TOPIC_REF;
  const computedSelectedUnlockStatus = useTopicUnlockStatus(refForHooks, allGraphs);
  const computedSelectedDueCardsCount = useDueCardsCount(refForHooks, selectedCards);

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

  const barUnlockStatus = useMemo(
    () => (selectedTopic ? computedSelectedUnlockStatus : null),
    [selectedTopic, computedSelectedUnlockStatus],
  );

  // Content generation awareness
  const selectedTopicContentStatus: TopicContentStatus = useMemo(() => {
    if (!selectedTopic) {
      return 'ready';
    }
    const key = topicRefKey(selectedTopic);
    return contentStatusMap[key] ?? 'ready';
  }, [selectedTopic, contentStatusMap]);

  const activeTopicContentGenLabel = useContentGenerationStore((s) => {
    if (!selectedTopic) return null;
    return activeTopicContentGenerationLabel(s, selectedTopic.subjectId, selectedTopic.topicId);
  });

  const isTopicStudyContentGenerating =
    selectedTopicContentStatus === 'generating' || activeTopicContentGenLabel !== null;

  const celebrationLookupKey = selectedTopic ? topicRefKey(selectedTopic) : '';
  const isCelebrationPendingForTopic = useCrystalContentCelebrationStore((s) =>
    celebrationLookupKey !== '' ? s.pendingByTopicKey[celebrationLookupKey] === true : false,
  );

  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!selectedTopic) {
      setDetailsOpen(false);
    }
  }, [selectedTopic]);

  const topicName = selectedMetadata?.topicName || 'Selected topic';
  const selectedDueCards = useMemo(() => {
    if (!selectedCards.length || !selectedTopic) {
      return 0;
    }
    return computedSelectedDueCardsCount;
  }, [computedSelectedDueCardsCount, selectedCards, selectedTopic]);

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
    crystalGardenOrchestrator.unlockTopic(selectedTopic, allGraphs);

    // Auto-trigger generation pipeline when content is not ready.
    const tKey = topicRefKey(selectedTopic);
    const status = contentStatusMap[tKey];
    if (status !== 'ready') {
      triggerTopicGenerationPipeline(selectedTopic.subjectId, selectedTopic.topicId, { stage: 'full' });
    }

    setDetailsOpen(false);
  }, [allGraphs, barUnlockStatus?.canUnlock, contentStatusMap, selectedTieredTopic, selectedTopic]);

  const handleTriggerGeneration = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!selectedTopic || isTopicStudyContentGenerating) {
        return;
      }
      triggerTopicGenerationPipeline(selectedTopic.subjectId, selectedTopic.topicId, { stage: 'full' });
    },
    [isTopicStudyContentGenerating, selectedTopic],
  );

  if (!isSelectionMode || !selectedTopic) {
    return null;
  }

  const stopPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const handleBeginStudySession: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    stopPropagation(event);
    if (!selectedCards?.length) {
      console.warn(`[TopicSelectionBar] No cards available for topic ${selectedTopic.topicId}`);
      return;
    }
    useCrystalContentCelebrationStore.getState().dismissPending(topicRefKey(selectedTopic));
    onStartTopicStudySession?.(selectedTopic, selectedCards);
    selectTopic(null);
  };

  const isTrialLoading = trialStatus === 'pregeneration';
  // "Prepared but XP-deficient" → show the small "X XP left" hint next to
  // the Begin Trial button. Falls out of `trialAvailable` so the gate can
  // remain disabled while still surfacing the actionable goal to the
  // player.
  const trialDisabledText =
    trialStatus === 'awaiting_player' && !trialAvailable && xpUntilTrialReady > 0
      ? `${Math.max(0, xpUntilTrialReady)} XP left`
      : null;

  const handleBeginTrial: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    stopPropagation(event);
    if (!trialAvailable) {
      return;
    }
    openCrystalTrial();
  };

  const handleClear: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    stopPropagation(event);
    selectTopic(null);
  };

  const showUnlockButton = Boolean(selectedTieredTopic?.isLocked);

  const playCelebrationParticlesActive =
    !isTopicStudyContentGenerating &&
    trialStatus !== 'pregeneration' &&
    selectedTopicContentStatus === 'ready' &&
    isCelebrationPendingForTopic;

  const trialGateParticlesActive = trialAvailable;

  const containerClass = 'fixed z-50 flex justify-center px-2 sm:px-3';
  const containerStyle: React.CSSProperties = {
    left: '0.25rem',
    right: '0.25rem',
    bottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
  };

  // Determine the primary action button in the action area.
  const renderPrimaryAction = () => {
    if (isTopicStudyContentGenerating) {
      // Replace Play with generation status label.
      const label = activeTopicContentGenLabel ?? 'Generating…';
      return (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[10px] leading-tight text-primary"
          role="status"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
          <span className="max-w-[6rem] truncate">{label}</span>
        </span>
      );
    }

    if (selectedTopicContentStatus === 'unavailable' && !showUnlockButton) {
      // Unlocked but no content and not generating — offer a Generate button.
      return (
        <Button
          type="button"
          size="icon-sm"
          onClick={handleTriggerGeneration}
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onTouchStart={stopPropagation}
          aria-label="Generate content"
          title="Generate content"
          className="shrink-0"
        >
          <Sparkles data-icon="inline-start" aria-hidden />
        </Button>
      );
    }

    // Default: Play button.
    return (
      <Button
        type="button"
        size="icon-sm"
        onClick={handleBeginStudySession}
        onPointerDown={stopPropagation}
        onMouseDown={stopPropagation}
        onTouchStart={stopPropagation}
        aria-label="Begin study session"
        title="Begin study session"
        className="relative shrink-0 overflow-visible"
      >
        <Play data-icon="inline-start" className="relative z-10" aria-hidden />
        <ParticlesAnimation isActive={playCelebrationParticlesActive} particles={RITUAL_PARTICLE_ANIMATION} />
      </Button>
    );
  };

  return (
    <>
      <div className={containerClass} style={containerStyle}>
        <div className="inline-flex w-full max-w-lg flex-row flex-nowrap items-center gap-2 rounded-lg border border-border bg-card/80 px-2 py-1.5 shadow-sm backdrop-blur-sm sm:w-auto">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {selectedTieredTopic ? (
                  <TopicIcon
                    iconName={selectedTieredTopic.iconName}
                    className="size-3.5 shrink-0 text-primary"
                  />
                ) : null}
                <span className="truncate text-xs font-semibold text-foreground">{topicName}</span>
              </span>
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
                <Lock data-icon="inline-start" aria-hidden />
              </Button>
            ) : null}

            {renderPrimaryAction()}

            {!isTopicStudyContentGenerating && selectedTopicContentStatus === 'ready' ? (
              <Button
                type="button"
                size="icon-sm"
                variant={trialAvailable ? 'default' : 'secondary'}
                disabled={!trialAvailable || isTrialLoading}
                onClick={handleBeginTrial}
                onPointerDown={stopPropagation}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                aria-label={
                  isTrialLoading
                    ? 'Generating trial'
                    : trialAvailable
                      ? 'Begin trial'
                      : trialDisabledText
                        ? `Trial unavailable: ${trialDisabledText}`
                      : 'Trial unavailable'
                }
                title={
                  isTrialLoading
                    ? 'Generating trial questions...'
                    : trialAvailable
                      ? 'Begin trial'
                      : trialDisabledText
                        ? `Trial unavailable: ${trialDisabledText}`
                      : 'Trial unavailable'
                }
                className="relative shrink-0 overflow-visible disabled:opacity-60"
              >
                {isTrialLoading ? (
                  <Loader2 data-icon="inline-start" className="relative z-10 animate-spin" aria-hidden />
                ) : (
                  <Sparkles data-icon="inline-start" className="relative z-10" aria-hidden />
                )}
                <ParticlesAnimation isActive={trialGateParticlesActive} particles={RITUAL_PARTICLE_ANIMATION} />
              </Button>
            ) : null}
            {trialDisabledText && !isTopicStudyContentGenerating && selectedTopicContentStatus === 'ready' ? (
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
              <X data-icon="inline-start" aria-hidden />
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
