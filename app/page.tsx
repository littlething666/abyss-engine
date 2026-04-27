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
import { Sparkles } from 'lucide-react';

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
import { useMediaQuery } from '@/hooks/use-media-query';
import { useContentGenerationHydration } from '@/hooks/useContentGenerationHydration';
import { useContentGenerationLifecycle } from '@/hooks/useContentGenerationLifecycle';
import { topicRefKey } from '@/lib/topicRef';
import { useTopicCardQueriesForSubjectFilter } from '@/hooks/useTopicCardQueries';
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
  const [sceneOverlayVisible, setSceneOverlayVisible] = useState(() => !skipSceneLo