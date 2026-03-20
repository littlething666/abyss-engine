'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useQueries } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useProgressionStore as useStudyStore } from '@/features/progression';
import { useUIStore } from '@/store/uiStore';
import { Rating } from '@/types';
import type { Card } from '@/types/core';
import DebugControls from '@/components/debug/DebugControls';

import { initAbyssDev } from '@/utils/abyssDev';
import { AttunementRitualPayload } from '@/types/progression';
import { useTopicMetadata } from '@/features/content';
import { deckRepository } from '@/infrastructure/di';
import { Badge } from '@/components/ui/badge';

// Components
import StatsOverlay from '@/components/StatsOverlay';
import { AttunementRitualModal } from '@/components/AttunementRitualModal';
import DiscoveryModal from '@/components/DiscoveryModal';
import StudyPanelModal from '@/components/StudyPanelModal';
import StudyTimelineModal from '@/components/StudyTimelineModal';
import SubjectNavigation from '@/components/SubjectNavigation';
import PomodoroTimerOverlay from '@/components/PomodoroTimer3D';

// Dynamic import for Scene to avoid SSR issues with Three.js
const Scene = dynamic(() => import('@/components/Scene'), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen flex items-center justify-center bg-background text-foreground text-2xl">
      Loading 3D Scene...
    </div>
  ),
});

/**
 * Main App Component for Abyss Engine Phase 2
 * Features: Full screen 3D crystal grid, click altar to study
 * Coordinates between the 3D scene and UI modals
 */
const HomeContent: React.FC = () => {
  const searchParams = useSearchParams();
  const isDebugMode = searchParams.get('debug') === '1';
  const [showStats, setShowStats] = useState(true);
  const [isCameraAngleUnlocked, setIsCameraAngleUnlocked] = useState(isDebugMode);

  // Track initialization to prevent infinite loops
  const initializedRef = useRef(false);

  // Initialize client-side flag
  const [isClient, setIsClient] = useState(false);

  // Get data for StatsOverlay - stable selectors
  const currentSession = useStudyStore((state) => state.currentSession);
  const activeCrystals = useStudyStore(s => s.activeCrystals);
  const currentSubjectId = useStudyStore(s => s.currentSubjectId);
  const sm2Data = useStudyStore(s => s.sm2Data);
  const levelUpMessage = useStudyStore(s => s.levelUpMessage);
  const unlockPoints = useStudyStore(s => s.unlockPoints);
  const activeBuffs = useStudyStore((state) => state.activeBuffs);
  const getRemainingRitualCooldownMs = useStudyStore((state) => state.getRemainingRitualCooldownMs);
  const getDueCardsCount = useStudyStore((state) => state.getDueCardsCount);
  const focusStudyCard = useStudyStore((state) => state.focusStudyCard);

  const activeTopicIds = useMemo(() => Array.from(new Set(activeCrystals.map((crystal) => crystal.topicId))), [activeCrystals]);
  const allTopicMetadata = useTopicMetadata(activeTopicIds);
  const subjectFilteredTopicIds = useMemo(() => {
    if (!currentSubjectId) {
      return activeTopicIds;
    }

    return activeTopicIds.filter((topicId) => allTopicMetadata[topicId]?.subjectId === currentSubjectId);
  }, [activeTopicIds, allTopicMetadata, currentSubjectId]);
  const topicCardQueries = useQueries({
    queries: subjectFilteredTopicIds.map((topicId) => {
      const subjectId = allTopicMetadata[topicId]?.subjectId || '';
      return {
        queryKey: ['content', 'topic-cards', subjectId, topicId],
        queryFn: () => deckRepository.getTopicCards(subjectId, topicId),
        enabled: Boolean(subjectId),
        staleTime: Infinity,
      };
    }),
  });
  const allTopicsCardCounts = useMemo(() => {
    let due = 0;
    let total = 0;

    topicCardQueries.forEach((query) => {
      const cards = query?.data ?? [];
      const refs = cards.map((card) => ({ id: card.id }));
      due += getDueCardsCount ? getDueCardsCount(refs) : refs.length;
      total += refs.length;
    });

    return { due, total };
  }, [getDueCardsCount, sm2Data, topicCardQueries]);
  const dueCards = allTopicsCardCounts.due;
  const totalCards = allTopicsCardCounts.total;

  const topicCardsById = useMemo(() => {
    const map = new Map<string, Card[]>();
    subjectFilteredTopicIds.forEach((topicId, index) => {
      const cards = topicCardQueries[index]?.data;
      if (cards) {
        map.set(topicId, cards);
      }
    });
    return map;
  }, [subjectFilteredTopicIds, topicCardQueries]);

  // Get store actions - stable references
  const initialize = useStudyStore(s => s.initialize);
  const flipCurrentCard = useStudyStore(s => s.flipCurrentCard);
  const submitStudyResult = useStudyStore(s => s.submitStudyResult);
  const undoLastStudyResult = useStudyStore(s => s.undoLastStudyResult);
  const redoLastStudyResult = useStudyStore(s => s.redoLastStudyResult);
  const submitAttunementRitual = useStudyStore(s => s.submitAttunementRitual);
  const clearPendingRitual = useStudyStore(s => s.clearPendingRitual);
  const isCurrentCardFlipped = useStudyStore(s => s.isCurrentCardFlipped);

  // UI store - modal state - stable selectors
  const isDiscoveryModalOpen = useUIStore(s => s.isDiscoveryModalOpen);
  const isStudyPanelOpen = useUIStore(s => s.isStudyPanelOpen);
  const isRitualModalOpen = useUIStore(s => s.isRitualModalOpen);
  const isStudyTimelineOpen = useUIStore((state) => state.isStudyTimelineOpen);
  const closeDiscoveryModal = useUIStore(s => s.closeDiscoveryModal);
  const closeStudyPanel = useUIStore(s => s.closeStudyPanel);
  const openRitualModal = useUIStore(s => s.openRitualModal);
  const closeRitualModal = useUIStore(s => s.closeRitualModal);
  const openStudyTimeline = useUIStore((state) => state.openStudyTimeline);
  const closeStudyTimeline = useUIStore((state) => state.closeStudyTimeline);
  const selectTopic = useUIStore((state) => state.selectTopic);
  const openStudyPanel = useUIStore((state) => state.openStudyPanel);

  const ritualCooldownRemainingMs = getRemainingRitualCooldownMs(Date.now());

  const currentTopicId = currentSession?.topicId || null;

  // Initialize on mount - only once
  useEffect(() => {
    setIsClient(true);

    // Initialize abyssDev for console access
    initAbyssDev();

    // Only initialize once
    if (!initializedRef.current) {
      initializedRef.current = true;
      initialize();
    }
  }, [initialize]);

  const handleRate = (cardId: string, isCorrect?: boolean, selfRating?: Rating) => {
    const reviewRating = selfRating ?? (isCorrect === undefined ? 3 : isCorrect ? 3 : 1);

    submitStudyResult(cardId || currentSession?.currentCardId || '', reviewRating);
  };

  // Discovery Modal handlers
  const handleCloseDiscoveryModal = () => {
    closeDiscoveryModal();
  };

  // Study Panel Modal handlers
  const handleCloseStudyPanel = () => {
    closeStudyPanel();
  };

  const handleUndo = useCallback(() => {
    const session = useStudyStore.getState().currentSession;
    const canUndo = (session?.undoStack?.length ?? 0) > 0;
    if (!canUndo) { return; }

    undoLastStudyResult();
  }, [undoLastStudyResult]);

  const handleRedo = useCallback(() => {
    const session = useStudyStore.getState().currentSession;
    const canRedo = (session?.redoStack?.length ?? 0) > 0;
    if (!canRedo) { return; }

    redoLastStudyResult();
  }, [redoLastStudyResult]);

  const handleOpenRitualModal = () => {
    openRitualModal();
  };

  const handleAttunementSubmit = (payload: AttunementRitualPayload) => {
    return submitAttunementRitual(payload);
  };

  const handleCloseAttunement = () => {
    clearPendingRitual();
    closeRitualModal();
  };

  const handleOpenStudyTimeline = () => {
    openStudyTimeline();
  };

  const handleCloseStudyTimeline = () => {
    closeStudyTimeline();
  };

  const handleTimelineOpenStudy = useCallback(
    (payload: { topicId: string; cardId?: string }) => {
      const cards = topicCardsById.get(payload.topicId);
      if (!cards?.length) {
        return;
      }
      focusStudyCard(payload.topicId, cards, payload.cardId ?? null);
      selectTopic(payload.topicId);
      closeStudyTimeline();
      openStudyPanel();
    },
    [topicCardsById, focusStudyCard, selectTopic, closeStudyTimeline, openStudyPanel],
  );

  if (!isClient) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background text-foreground text-2xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="w-screen h-screen relative overflow-hidden">
      {/* Subject Navigation - 2D Dropdown for Multi-Floor selection */}
      <SubjectNavigation />

      {/* Full Screen 3D Scene */}
      <div className="absolute inset-0">
        <Scene
          showStats={isDebugMode && showStats}
          isCameraAngleUnlocked={isCameraAngleUnlocked}
        />
      </div>
      <PomodoroTimerOverlay />

        {/* Stats Overlay */}
        <StatsOverlay
          totalCards={totalCards}
          dueCards={dueCards}
          activeBuffs={activeBuffs}
          onOpenStudyTimeline={handleOpenStudyTimeline}
        />

        <AttunementRitualModal
          isOpen={isRitualModalOpen}
          cooldownRemainingMs={ritualCooldownRemainingMs}
          onClose={handleCloseAttunement}
          onSubmit={handleAttunementSubmit}
        />

        {/* Title */}
        <div className="absolute right-3 top-3 z-10 max-w-[min(100%,11rem)] text-right">
          <h1 className="m-0 text-sm font-semibold tracking-tight text-foreground">
            Abyss Engine
          </h1>
          {unlockPoints > 0 && (
            <Badge variant="secondary" className="mt-1 h-5 px-1.5 text-[10px] font-normal">
              {unlockPoints} unlock{unlockPoints !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Discovery Modal - Tiered Skill Tree */}
        <DiscoveryModal
          isOpen={isDiscoveryModalOpen}
          unlockPoints={unlockPoints}
          onOpenRitual={handleOpenRitualModal}
          ritualCooldownRemainingMs={ritualCooldownRemainingMs}
          onClose={handleCloseDiscoveryModal}
        />

        {/* Study Panel Modal */}
        <StudyPanelModal
          isOpen={isStudyPanelOpen}
          currentCardId={currentSession?.currentCardId || null}
          currentTopicId={currentTopicId}
          isCardFlipped={isCurrentCardFlipped}
          totalCards={currentSession?.totalCards ?? totalCards}
          levelUpMessage={levelUpMessage}
          onClose={handleCloseStudyPanel}
          onFlip={flipCurrentCard}
          onSubmitResult={handleRate}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />

        <StudyTimelineModal
          isOpen={isStudyTimelineOpen}
          onClose={handleCloseStudyTimeline}
          topicMetadata={allTopicMetadata}
          onOpenEntryStudy={handleTimelineOpenStudy}
        />

      {isDebugMode && (
        <DebugControls
          onShowStatsChange={setShowStats}
          onCameraAngleUnlockChange={setIsCameraAngleUnlocked}
          defaultCameraAngleUnlocked
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="w-screen h-screen flex items-center justify-center bg-background text-foreground text-2xl">
          Loading deck data...
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
