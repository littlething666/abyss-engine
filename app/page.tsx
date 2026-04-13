'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useQueries } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useProgressionStore as useStudyStore } from '@/features/progression';
import { undoManager } from '@/features/progression/undoManager';
import { useUIStore } from '@/store/uiStore';
import { Rating } from '@/types';
import type { Card } from '@/types/core';
import DebugControls from '@/components/debug/DebugControls';

import { initAbyssDev } from '@/utils/abyssDev';
import { AttunementRitualPayload } from '@/types/progression';
import { filterCardsForStudy, useTopicMetadata, type StudyCardFilterSelection } from '@/features/content';
import { deckRepository } from '@/infrastructure/di';
import { syncDeckIndexedDbDebugFromApp } from '@/infrastructure/deckDb/deckDbDebugLog';
import { Button } from '@/components/ui/button';
import { CloudLoadingScreen } from '@/components/ui/CloudLoadingScreen';
import { Search } from 'lucide-react';

// Components
import StatsOverlay from '@/components/StatsOverlay';
import { GenerationProgressHud } from '@/components/GenerationProgressHud';
import { IncrementalSubjectModal } from '@/components/IncrementalSubjectModal';
import { AttunementRitualModal } from '@/components/AttunementRitualModal';
import DiscoveryModal from '@/components/DiscoveryModal';
import StudyPanelModal from '@/components/StudyPanelModal';
import StudyTimelineModal from '@/components/StudyTimelineModal';
import { AbyssCommandPalette } from '@/components/AbyssCommandPalette';
import { ScreenCaptureLlmSummarySurface } from '@/components/ScreenCaptureLlmSummarySurface';
import SubjectNavigation from '@/components/SubjectNavigation';
import PomodoroTimerOverlay from '@/components/PomodoroTimer3D';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useScreenCaptureLlmSummary } from '@/hooks/useScreenCaptureLlmSummary';
import { useInferenceTtsToggle } from '@/hooks/useInferenceTtsToggle';
import { useLlmAssistantSpeech } from '@/hooks/useLlmAssistantSpeech';
import { useContentGenerationHydration } from '@/hooks/useContentGenerationHydration';
import { useContentGenerationLifecycle } from '@/hooks/useContentGenerationLifecycle';
import { useThinkingToggle } from '@/hooks/useThinkingToggle';
import { LlmThinkingToggle } from '@/components/LlmThinkingToggle';
import { LlmTtsToggle } from '@/components/LlmTtsToggle';
import { topicCardsQueryKey } from '@/hooks/useDeckData';
import { toast } from 'sonner';

// Dynamic import for Scene to avoid SSR issues with Three.js.
// Loading UI is a single parent overlay until Canvas reports ready (avoids loader ↔ scene swap blink).
const Scene = dynamic(() => import('@/components/Scene'), {
  ssr: false,
  loading: () => null,
});

/**
 * Main App Component for Abyss Engine Phase 2
 * Features: Full screen 3D crystal grid, click altar to study
 * Coordinates between the 3D scene and UI modals
 */
const HomeContent: React.FC = () => {
  const searchParams = useSearchParams();
  const isDebugMode = searchParams.get('debug') === '1';
  /** E2E / Playwright: full-screen loader stays until WebGPU `onCreated`; skip it so UI is reachable even if GPU init stalls. */
  const skipSceneLoadingOverlay =
    searchParams.get('e2e') === '1' || process.env.NEXT_PUBLIC_PLAYWRIGHT === '1';
  const [showStats, setShowStats] = useState(true);
  const [isCameraAngleUnlocked, setIsCameraAngleUnlocked] = useState(isDebugMode);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isIncrementalSubjectOpen, setIsIncrementalSubjectOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const screenCaptureThinking = useThinkingToggle('screenCaptureSummary');
  const screenCaptureTts = useInferenceTtsToggle('screenCaptureSummary');
  const screenCaptureLlm = useScreenCaptureLlmSummary({
    enableThinking: screenCaptureThinking.enableThinking,
  });
  const screenCaptureAssistantSpeech = useLlmAssistantSpeech({
    isSurfaceOpen: screenCaptureLlm.surfaceOpen,
    ttsEnabled: screenCaptureTts.enableTts,
    assistantText: screenCaptureLlm.assistantText,
    isPending: screenCaptureLlm.isPending,
  });

  useContentGenerationHydration();
  useContentGenerationLifecycle();
  // Track initialization to prevent infinite loops
  const initializedRef = useRef(false);

  const [sceneOverlayMounted, setSceneOverlayMounted] = useState(() => !skipSceneLoadingOverlay);
  const [sceneOverlayVisible, setSceneOverlayVisible] = useState(() => !skipSceneLoadingOverlay);

  const handleSceneCanvasReady = useCallback(() => {
    if (skipSceneLoadingOverlay) {
      return;
    }
    setSceneOverlayVisible(false);
  }, [skipSceneLoadingOverlay]);

  const handleSceneCanvasReleased = useCallback(() => {
    if (skipSceneLoadingOverlay) {
      return;
    }
    setSceneOverlayMounted(true);
    setSceneOverlayVisible(true);
  }, [skipSceneLoadingOverlay]);

  const handleSceneOverlayExitComplete = useCallback(() => {
    setSceneOverlayMounted(false);
  }, []);

  // Deck counts for Discovery modal and study panel
  const currentSession = useStudyStore((state) => state.currentSession);
  const activeCrystals = useStudyStore(s => s.activeCrystals);
  const currentSubjectId = useStudyStore(s => s.currentSubjectId);
  const sm2Data = useStudyStore(s => s.sm2Data);
  const unlockPoints = useStudyStore(s => s.unlockPoints);
  const activeBuffs = useStudyStore((state) => state.activeBuffs);
  const getRemainingRitualCooldownMs = useStudyStore((state) => state.getRemainingRitualCooldownMs);
  const getDueCardsCount = useStudyStore((state) => state.getDueCardsCount);
  const focusStudyCard = useStudyStore((state) => state.focusStudyCard);
  const startTopicStudySession = useStudyStore((state) => state.startTopicStudySession);

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
        queryKey: topicCardsQueryKey(subjectId, topicId),
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
  const flipCurrentCard = useUIStore(s => s.flipCurrentCard);
  const submitStudyResult = useStudyStore(s => s.submitStudyResult);
  const undoLastStudyResult = useStudyStore(s => s.undoLastStudyResult);
  const redoLastStudyResult = useStudyStore(s => s.redoLastStudyResult);
  const submitAttunementRitual = useStudyStore(s => s.submitAttunementRitual);
  const clearPendingRitual = useStudyStore(s => s.clearPendingRitual);
  const isCurrentCardFlipped = useUIStore(s => s.isCurrentCardFlipped);

  // UI store - modal state - stable selectors
  const isDiscoveryModalOpen = useUIStore(s => s.isDiscoveryModalOpen);
  const isStudyPanelOpen = useUIStore(s => s.isStudyPanelOpen);
  const isRitualModalOpen = useUIStore(s => s.isRitualModalOpen);
  const isStudyTimelineOpen = useUIStore((state) => state.isStudyTimelineOpen);
  const closeDiscoveryModal = useUIStore(s => s.closeDiscoveryModal);
  const openDiscoveryModal = useUIStore(s => s.openDiscoveryModal);
  const closeStudyPanel = useUIStore(s => s.closeStudyPanel);
  const openRitualModal = useUIStore(s => s.openRitualModal);
  const closeRitualModal = useUIStore(s => s.closeRitualModal);
  const closeStudyTimeline = useUIStore((state) => state.closeStudyTimeline);
  const selectTopic = useUIStore((state) => state.selectTopic);
  const openStudyPanel = useUIStore((state) => state.openStudyPanel);

  const ritualCooldownRemainingMs = getRemainingRitualCooldownMs(Date.now());

  const currentTopicId = currentSession?.topicId || null;

  useEffect(() => {
    syncDeckIndexedDbDebugFromApp(isDebugMode);
    return () => syncDeckIndexedDbDebugFromApp(null);
  }, [isDebugMode]);

  // Initialize on mount - only once
  useEffect(() => {
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
    if (!undoManager.canUndo) { return; }

    undoLastStudyResult();
  }, [undoLastStudyResult]);

  const handleRedo = useCallback(() => {
    if (!undoManager.canRedo) { return; }

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

  const handleStartStudyWithCardTypes = useCallback(
    (selection: StudyCardFilterSelection) => {
      const topicId = useUIStore.getState().selectedTopicId;
      if (!topicId) {
        toast.error('Select a topic crystal first.');
        return;
      }
      const cards = topicCardsById.get(topicId) ?? [];
      const filtered = filterCardsForStudy(
        cards,
        new Set(selection.enabledBaseTypes),
        new Set(selection.enabledMiniGameTypes),
      );
      if (filtered.length === 0) {
        toast.error('No cards match the selected types.');
        return;
      }
      selectTopic(topicId);
      startTopicStudySession(topicId, filtered);
      openStudyPanel();
    },
    [topicCardsById, selectTopic, startTopicStudySession, openStudyPanel],
  );

  return (
    <div className="w-screen h-screen relative overflow-hidden">
      {sceneOverlayMounted && (
        <div className="fixed inset-0 z-40">
          <CloudLoadingScreen
            visible={sceneOverlayVisible}
            onExitComplete={handleSceneOverlayExitComplete}
          />
        </div>
      )}

      <SubjectNavigation />

      <div className="absolute inset-0">
        <Scene
          showStats={isDebugMode && showStats}
          isCameraAngleUnlocked={isCameraAngleUnlocked}
          onCanvasReady={handleSceneCanvasReady}
          onCanvasReleased={handleSceneCanvasReleased}
        />
      </div>

      <div
        className="fixed z-20 max-w-[min(100%,11rem)] text-left"
        style={{
          top: 'calc(0.75rem + env(safe-area-inset-top))',
          left: 'calc(0.75rem + env(safe-area-inset-left))',
        }}
      >
        <h1 className="m-0 text-sm font-semibold tracking-tight text-foreground">
          Abyss Engine
        </h1>
        {unlockPoints > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1"
            onClick={() => openDiscoveryModal()}
            aria-label="Open Wisdom Altar (unlocks)"
          >
            {unlockPoints} unlock{unlockPoints !== 1 ? 's' : ''}
          </Button>
        )}
      </div>

      <div
        className="fixed z-20 flex flex-col items-end gap-1.5"
        style={{
          top: 'calc(0.75rem + env(safe-area-inset-top))',
          right: 'calc(0.75rem + env(safe-area-inset-right))',
        }}
      >
        <GenerationProgressHud />
        <StatsOverlay activeBuffs={activeBuffs} />
      </div>

      <div
        className="fixed z-20 flex flex-row items-end justify-end gap-2"
        style={{
          bottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          right: 'calc(0.75rem + env(safe-area-inset-right))',
        }}
      >
        <PomodoroTimerOverlay />
        <Button
          size="icon-sm"
          variant="outline"
          type="button"
          onClick={() => setIsCommandPaletteOpen(true)}
          title="Command palette (Ctrl+K or ⌘K)"
          aria-label="Open command palette"
          data-testid="command-palette-trigger"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AbyssCommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        isDebugMode={isDebugMode}
        onSummarizeScreen={screenCaptureLlm.startSummarize}
        onOpenSubjectCurriculum={() => setIsIncrementalSubjectOpen(true)}
        onStartStudyWithCardTypes={handleStartStudyWithCardTypes}
      />

      <IncrementalSubjectModal isOpen={isIncrementalSubjectOpen} onClose={() => setIsIncrementalSubjectOpen(false)} />

      <ScreenCaptureLlmSummarySurface
        isDesktop={isDesktop}
        surfaceOpen={screenCaptureLlm.surfaceOpen}
        onSurfaceOpenChange={screenCaptureLlm.handleSurfaceOpenChange}
        onDismissOutside={screenCaptureLlm.dismissSurface}
        isPending={screenCaptureLlm.isPending}
        assistantText={screenCaptureLlm.assistantText}
        reasoningText={screenCaptureLlm.reasoningText}
        errorMessage={screenCaptureLlm.errorMessage}
        headerAction={
          <div className="flex items-center gap-1">
            <LlmThinkingToggle
              enabled={screenCaptureThinking.enableThinking}
              onToggle={screenCaptureThinking.toggleThinking}
            />
            <LlmTtsToggle
              enabled={screenCaptureTts.enableTts}
              onToggle={screenCaptureTts.toggleTts}
              speaking={screenCaptureAssistantSpeech.isSpeaking}
            />
          </div>
        }
      />

      <AttunementRitualModal
        isOpen={isRitualModalOpen}
        cooldownRemainingMs={ritualCooldownRemainingMs}
        onClose={handleCloseAttunement}
        onSubmit={handleAttunementSubmit}
      />

      <DiscoveryModal
        isOpen={isDiscoveryModalOpen}
        unlockPoints={unlockPoints}
        dueCards={dueCards}
        totalCards={totalCards}
        onOpenRitual={handleOpenRitualModal}
        ritualCooldownRemainingMs={ritualCooldownRemainingMs}
        onClose={handleCloseDiscoveryModal}
      />

      <StudyPanelModal
        isOpen={isStudyPanelOpen}
        currentCardId={currentSession?.currentCardId || null}
        currentTopicId={currentTopicId}
        isCardFlipped={isCurrentCardFlipped}
        totalCards={currentSession?.totalCards ?? totalCards}
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
    <Suspense fallback={<CloudLoadingScreen />}>
      <HomeContent />
    </Suspense>
  );
}
