'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useProgressionStore as useStudyStore } from '@/features/progression';
import { undoManager } from '@/features/progression/undoManager';
import { useUIStore } from '@/store/uiStore';
import { useFeatureFlagsStore } from '@/store/featureFlagsStore';
import { CoarseChoice, Rating } from '@/types';

import { initAbyssDev } from '@/utils/abyssDev';
import { AttunementRitualPayload } from '@/types/progression';
import { filterCardsForStudy, useTopicMetadata, type StudyCardFilterSelection } from '@/features/content';
import { initializeDebugMode, isDebugModeEnabled } from '@/infrastructure/debugMode';
import { Button } from '@/components/ui/button';
import { CloudLoadingScreen } from '@/components/ui/CloudLoadingScreen';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ListTree, Menu } from 'lucide-react';

import StatsOverlay from '@/components/StatsOverlay';
import { GenerationProgressHud } from '@/components/GenerationProgressHud';
import { IncrementalSubjectModal } from '@/components/IncrementalSubjectModal';
import { AttunementRitualModal } from '@/components/AttunementRitualModal';
import DiscoveryModal from '@/components/DiscoveryModal';
import StudyPanelModal from '@/components/StudyPanelModal';
import StudyTimelineModal from '@/components/StudyTimelineModal';
import { AbyssCommandPalette } from '@/components/AbyssCommandPalette';
import SubjectNavigationHud from '@/components/SubjectNavigationHud';
import PomodoroTimerOverlay from '@/components/PomodoroTimer3D';
import { CrystalTrialModal } from '@/components/CrystalTrial';
import { MentorBootstrapMount } from '@/components/MentorBootstrapMount';
import { MentorDialogOverlay } from '@/components/MentorDialogOverlay';
import { tryEnqueueMentorEntry } from '@/features/mentor';
import { useMentorEntryContext } from '@/hooks/useMentorEntryContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useContentGenerationHydration } from '@/hooks/useContentGenerationHydration';
import { useContentGenerationLifecycle } from '@/hooks/useContentGenerationLifecycle';
import { topicRefKey } from '@/lib/topicRef';
import { useTopicCardQueriesForSubjectFilter } from '@/hooks/useTopicCardQueries';
import { applyOpenTopicStudyEffect } from '@/hooks/openTopicStudyAdapter';
import type { Card } from '@/types/core';
import { toast } from '@/infrastructure/toast';

const Scene = dynamic(() => import('@/components/Scene'), {
  ssr: false,
  loading: () => null,
});

const HomeContent: React.FC = () => {
  const searchParams = useSearchParams();
  initializeDebugMode(searchParams);
  const isDebugMode = isDebugModeEnabled();
  const skipSceneLoadingOverlay =
    searchParams.get('e2e') === '1' || process.env.NEXT_PUBLIC_PLAYWRIGHT === '1';
  const [showStats, setShowStats] = useState(true);
  const [isCameraAngleUnlocked, setIsCameraAngleUnlocked] = useState(isDebugMode);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isIncrementalSubjectOpen, setIsIncrementalSubjectOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useContentGenerationHydration();
  useContentGenerationLifecycle();
  const initializedRef = useRef(false);

  const [sceneOverlayMounted, setSceneOverlayMounted] = useState(() => !skipSceneLoadingOverlay);
  const [sceneOverlayVisible, setSceneOverlayVisible] = useState(() => !skipSceneLoadingOverlay);

  const handleSceneCanvasReady = useCallback(() => {
    if (skipSceneLoadingOverlay) return;
    setSceneOverlayVisible(false);
  }, [skipSceneLoadingOverlay]);

  const handleSceneCanvasReleased = useCallback(() => {
    if (skipSceneLoadingOverlay) return;
    setSceneOverlayMounted(true);
    setSceneOverlayVisible(true);
  }, [skipSceneLoadingOverlay]);

  const handleSceneOverlayExitComplete = useCallback(() => {
    setSceneOverlayMounted(false);
  }, []);

  const pomodoroVisible = useFeatureFlagsStore((s) => s.pomodoroVisible);

  const currentSession = useStudyStore((state) => state.currentSession);
  const activeCrystals = useStudyStore((s) => s.activeCrystals);
  const currentSubjectId = useStudyStore((s) => s.currentSubjectId);
  const sm2Data = useStudyStore((s) => s.sm2Data);
  const unlockPoints = useStudyStore((s) => s.unlockPoints);
  const activeBuffs = useStudyStore((state) => state.activeBuffs);
  const getRemainingRitualCooldownMs = useStudyStore((state) => state.getRemainingRitualCooldownMs);
  const getDueCardsCount = useStudyStore((state) => state.getDueCardsCount);
  const focusStudyCard = useStudyStore((state) => state.focusStudyCard);
  const startTopicStudySession = useStudyStore((state) => state.startTopicStudySession);

  const activeTopicRefs = useMemo(
    () => activeCrystals.map((c) => ({ subjectId: c.subjectId, topicId: c.topicId })),
    [activeCrystals],
  );
  const allTopicMetadata = useTopicMetadata(activeTopicRefs);
  const { topicCardQueries, topicCardsByKey, queriedTopicRefs } = useTopicCardQueriesForSubjectFilter(
    activeTopicRefs,
    currentSubjectId,
    allTopicMetadata,
  );
  const allTopicsCardCounts = useMemo(() => {
    let due = 0;
    let total = 0;
    topicCardQueries.forEach((query, index) => {
      const cards = query?.data ?? [];
      const ref = queriedTopicRefs[index];
      if (!ref) return;
      due += getDueCardsCount(ref, cards);
      total += cards.length;
    });
    return { due, total };
  }, [getDueCardsCount, topicCardQueries, queriedTopicRefs]);
  const totalCards = allTopicsCardCounts.total;

  const initialize = useStudyStore((s) => s.initialize);
  const submitStudyResult = useStudyStore((s) => s.submitStudyResult);
  const submitCoarseStudyResult = useStudyStore((s) => s.submitCoarseStudyResult);
  const advanceStudyAfterReveal = useStudyStore((state) => state.advanceStudyAfterReveal);
  const undoLastStudyResult = useStudyStore((s) => s.undoLastStudyResult);
  const redoLastStudyResult = useStudyStore((s) => s.redoLastStudyResult);
  const submitAttunementRitual = useStudyStore((s) => s.submitAttunementRitual);
  const clearPendingRitual = useStudyStore((s) => s.clearPendingRitual);

  const isDiscoveryModalOpen = useUIStore((s) => s.isDiscoveryModalOpen);
  const isStudyPanelOpen = useUIStore((s) => s.isStudyPanelOpen);
  const isRitualModalOpen = useUIStore((s) => s.isRitualModalOpen);
  const isStudyTimelineOpen = useUIStore((state) => state.isStudyTimelineOpen);
  const closeDiscoveryModal = useUIStore((s) => s.closeDiscoveryModal);
  const openDiscoveryModal = useUIStore((s) => s.openDiscoveryModal);
  const openGlobalSettings = useUIStore((s) => s.openGlobalSettings);
  const closeStudyPanel = useUIStore((s) => s.closeStudyPanel);
  const openRitualModal = useUIStore((s) => s.openRitualModal);
  const closeRitualModal = useUIStore((s) => s.closeRitualModal);
  const closeStudyTimeline = useUIStore((state) => state.closeStudyTimeline);
  const selectTopic = useUIStore((state) => state.selectTopic);
  const openStudyPanel = useUIStore((state) => state.openStudyPanel);
  const openGenerationProgress = useUIStore((state) => state.openGenerationProgress);

  const ritualCooldownRemainingMs = getRemainingRitualCooldownMs(Date.now());

  const currentTopicId = currentSession?.topicId || null;
  const currentSubjectIdSession = currentSession?.subjectId ?? null;

  useEffect(() => {
    initAbyssDev();
    if (!initializedRef.current) {
      initializedRef.current = true;
      initialize();
    }
  }, [initialize]);

  const handleRate = (cardId: string, isCorrect?: boolean, selfRating?: Rating) => {
    const reviewRating = selfRating ?? (isCorrect === undefined ? 3 : isCorrect ? 3 : 1);
    submitStudyResult(cardId || currentSession?.currentCardId || '', reviewRating);
  };

  const handleCoarseRate = useCallback(
    (cardId: string, coarseChoice: CoarseChoice) => submitCoarseStudyResult(cardId || currentSession?.currentCardId || '', coarseChoice),
    [currentSession?.currentCardId, submitCoarseStudyResult],
  );

  const handleCloseDiscoveryModal = () => { closeDiscoveryModal(); };
  const handleCloseStudyPanel = () => { closeStudyPanel(); };

  const handleUndo = useCallback(() => {
    if (!undoManager.canUndo) return;
    undoLastStudyResult();
  }, [undoLastStudyResult]);

  const handleRedo = useCallback(() => {
    if (!undoManager.canRedo) return;
    redoLastStudyResult();
  }, [redoLastStudyResult]);

  const handleOpenRitualModal = () => { openRitualModal(); };
  const handleAttunementSubmit = (payload: AttunementRitualPayload) => submitAttunementRitual(payload);
  const handleCloseAttunement = () => { clearPendingRitual(); closeRitualModal(); };
  const handleCloseStudyTimeline = () => { closeStudyTimeline(); };

  const handleTimelineOpenStudy = useCallback(
    (payload: { subjectId: string; topicId: string; cardId?: string }) => {
      const ref = { subjectId: payload.subjectId, topicId: payload.topicId };
      const cards = topicCardsByKey.get(topicRefKey(ref));
      if (!cards?.length) return;
      focusStudyCard(ref, cards, payload.cardId ?? null);
      selectTopic(ref);
      closeStudyTimeline();
      openStudyPanel();
    },
    [topicCardsByKey, focusStudyCard, selectTopic, closeStudyTimeline, openStudyPanel],
  );

  const handleStartStudyWithCardTypes = useCallback(
    (selection: StudyCardFilterSelection) => {
      const topic = useUIStore.getState().selectedTopic;
      if (!topic) {
        toast.error('Select a topic crystal first.');
        return;
      }
      const cards = topicCardsByKey.get(topicRefKey(topic)) ?? [];
      const filtered = filterCardsForStudy(
        cards,
        new Set(selection.enabledBaseTypes),
        new Set(selection.enabledMiniGameTypes),
      );
      if (filtered.length === 0) {
        toast.error('No cards match the selected types.');
        return;
      }
      selectTopic(topic);
      startTopicStudySession(topic, filtered);
      openStudyPanel();
    },
    [topicCardsByKey, selectTopic, startTopicStudySession, openStudyPanel],
  );

  // Phase E: bridge the mentor `open_topic_study` effect onto existing
  // progression + UI actions. The adapter is a pure helper that lives
  // outside of `@/features/mentor`, so the mentor feature itself stays
  // free of progression-store imports.
  const handleOpenTopicStudyFromMentor = useCallback(
    (params: { subjectId: string; topicId: string }) => {
      const startStudyWithMutableCards = (
        topic: { subjectId: string; topicId: string },
        cards: readonly Card[],
      ) => {
        startTopicStudySession(topic, [...cards]);
      };
      const getCardsForTopic = (topic: { subjectId: string; topicId: string }) =>
        topicCardsByKey.get(topicRefKey(topic)) ?? [];
      applyOpenTopicStudyEffect(params, {
        selectTopic,
        startTopicStudySession: startStudyWithMutableCards,
        openStudyPanel,
        getCardsForTopic,
      });
    },
    [topicCardsByKey, selectTopic, startTopicStudySession, openStudyPanel],
  );

  const handleQuickActionWisdomAltar = useCallback(() => { openDiscoveryModal(); }, [openDiscoveryModal]);
  const handleQuickActionCommandPalette = useCallback(() => { setIsCommandPaletteOpen(true); }, []);
  const handleQuickActionSettings = useCallback(() => { openGlobalSettings(); }, [openGlobalSettings]);
  const handleQuickActionGenerationProgress = useCallback(
    () => { openGenerationProgress(); },
    [openGenerationProgress],
  );
  const handleCreateSubjectFromHud = useCallback(() => { setIsIncrementalSubjectOpen(true); }, []);
  // Discovery's empty-state CTA closes Discovery before opening
  // IncrementalSubjectModal so the two surfaces never stack. The mentor's
  // `open_discovery` effect routes through `openDiscoveryModal()` and then
  // surfaces this CTA from the Discovery empty-state.
  const handleCreateSubjectFromDiscovery = useCallback(() => {
    closeDiscoveryModal();
    setIsIncrementalSubjectOpen(true);
  }, [closeDiscoveryModal]);

  // Quick Actions "\ud83d\udde3\ufe0f Mentor" — keyboard-accessible parity with the
  // MentorBubble billboard. Both paths route through the contextual entry
  // helper, which encodes the v1 selection rules:
  //   overlay open    → no-op
  //   queue non-empty → no-op (queued head wins)
  //   else            → resolve trigger from live context, enqueue.
  const entryContext = useMentorEntryContext();
  const {
    subjectGraphActiveStage,
    subjectGenerationLabel,
    playerName,
    firstSubjectGenerationEnqueuedAt,
    mentorFailureEntry,
  } = entryContext;
  const handleQuickActionMentor = useCallback(() => {
    tryEnqueueMentorEntry({
      subjectGraphActiveStage,
      subjectGenerationLabel,
      playerName,
      firstSubjectGenerationEnqueuedAt,
      mentorFailureEntry,
    });
  }, [
    subjectGraphActiveStage,
    subjectGenerationLabel,
    playerName,
    firstSubjectGenerationEnqueuedAt,
    mentorFailureEntry,
  ]);

  const TOP_LEFT_STYLE: React.CSSProperties = { top: 'calc(0.75rem + env(safe-area-inset-top))', left: 'calc(0.75rem + env(safe-area-inset-left))' };
  const TOP_RIGHT_STYLE: React.CSSProperties = { top: 'calc(0.75rem + env(safe-area-inset-top))', right: 'calc(0.75rem + env(safe-area-inset-right))' };
  const BOTTOM_RIGHT_STYLE: React.CSSProperties = { bottom: 'calc(0.75rem + env(safe-area-inset-bottom))', right: 'calc(0.75rem + env(safe-area-inset-right))' };

  const quickActionsTrigger = (
    <Button
      size="icon-sm"
      variant="outline"
      type="button"
      title="Quick actions"
      aria-label="Quick actions"
      data-testid="quick-actions-trigger"
    >
      <Menu />
    </Button>
  );

  return (
    <div className="w-screen h-screen relative overflow-hidden">
      <MentorBootstrapMount />

      {sceneOverlayMounted && (
        <div className="fixed inset-0 z-40">
          <CloudLoadingScreen
            visible={sceneOverlayVisible}
            onExitComplete={handleSceneOverlayExitComplete}
          />
        </div>
      )}

      <SubjectNavigationHud onCreateSubject={handleCreateSubjectFromHud} />

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
        style={TOP_LEFT_STYLE}
      >
        <h1 className="m-0 text-sm font-semibold tracking-tight text-foreground">
          Abyss Engine
        </h1>
      </div>

      <div
        className="fixed z-20 flex flex-col items-end gap-1.5"
        style={TOP_RIGHT_STYLE}
      >
        <StatsOverlay activeBuffs={activeBuffs} />
      </div>

      <div
        className="fixed z-20 flex flex-row items-end justify-end gap-2"
        style={BOTTOM_RIGHT_STYLE}
      >
        {pomodoroVisible ? <PomodoroTimerOverlay /> : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={quickActionsTrigger} />
          <DropdownMenuContent side="top" align="end" sideOffset={8}>
            <DropdownMenuItem onClick={handleQuickActionWisdomAltar}>
              🏛️ Wisdom Altar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleQuickActionGenerationProgress}
              data-testid="quick-action-generation-progress"
            >
              <ListTree className="size-3.5 shrink-0 opacity-70" aria-hidden />
              Background generation
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleQuickActionMentor} data-testid="quick-action-mentor">
              🗣️ Mentor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleQuickActionCommandPalette}>
              🔍 Command palette (⌘K)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleQuickActionSettings}>
              ⚙️ Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AbyssCommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        isDebugMode={isDebugMode}
        onOpenSubjectCurriculum={() => setIsIncrementalSubjectOpen(true)}
        onStartStudyWithCardTypes={handleStartStudyWithCardTypes}
      />

      <IncrementalSubjectModal
        isOpen={isIncrementalSubjectOpen}
        onClose={() => setIsIncrementalSubjectOpen(false)}
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
        onOpenRitual={handleOpenRitualModal}
        ritualCooldownRemainingMs={ritualCooldownRemainingMs}
        onClose={handleCloseDiscoveryModal}
        onCreateSubject={handleCreateSubjectFromDiscovery}
      />

      <StudyPanelModal
        isOpen={isStudyPanelOpen}
        currentCardId={currentSession?.currentCardId || null}
        currentTopicId={currentTopicId}
        currentSubjectId={currentSubjectIdSession}
        totalCards={currentSession?.totalCards ?? totalCards}
        onClose={handleCloseStudyPanel}
        onSubmitResult={handleRate}
        onSubmitCoarseResult={handleCoarseRate}
        onAdvance={advanceStudyAfterReveal}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <StudyTimelineModal
        isOpen={isStudyTimelineOpen}
        onClose={handleCloseStudyTimeline}
        topicMetadata={allTopicMetadata}
        onOpenEntryStudy={handleTimelineOpenStudy}
      />

      <CrystalTrialModal />

      <MentorDialogOverlay onOpenTopicStudy={handleOpenTopicStudyFromMentor} />

      <GenerationProgressHud showTrigger={false} />
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
