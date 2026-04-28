'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';

import { ChatGptStyleHud } from '@/components/ChatGptStyleHud';
import { ContentGenerationHUD } from '@/components/ContentGenerationHUD';
import { CrystalDeckPanel } from '@/components/CrystalDeckPanel';
import { CrystalTopicLockedTooltip } from '@/components/CrystalTopicLockedTooltip';
import { DiscoveryModal } from '@/components/DiscoveryModal';
import { ImportSubjectFromUrlModal } from '@/components/ImportSubjectFromUrlModal';
import { IncrementalSubjectModal } from '@/components/IncrementalSubjectModal';
import { MentorBootstrapMount } from '@/components/MentorBootstrapMount';
import { MentorDialogOverlay } from '@/components/MentorDialogOverlay';
import { TextDecodingHelp } from '@/components/TextDecodingHelp';
import { ResetWorldDialog } from '@/components/ResetWorldDialog';
import { StudyPanel } from '@/components/StudyPanel';
import { useStudyPanelStore } from '@/features/study/studyPanelStore';
import { setStudyPanelStrategyForTesting } from '@/features/study/studyPanelStrategy';
import { runStudyPanelHotkeyAction } from '@/features/study/studyPanelHotkeys';
import { studyPanelStrategyKeyFromUrl } from '@/features/study/studyPanelStrategyKeyFromUrl';
import { useSubjectGenerationStore } from '@/features/subjectGeneration';

const SceneClient = dynamic(
  () => import('@/components/SceneClient').then((m) => m.SceneClient),
  { ssr: false },
);

export default function Home() {
  const searchParams = useSearchParams();
  const studyPanelOpen = useStudyPanelStore((s) => s.isOpen);
  const closeStudyPanel = useStudyPanelStore((s) => s.close);
  const isAnySubjectGenerating = useSubjectGenerationStore((s) =>
    Object.values(s.jobs).some((j) => j.status !== 'complete' && j.status !== 'failed'),
  );

  // Discovery modal
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const handleOpenDiscovery = useCallback(() => setIsDiscoveryOpen(true), []);
  const handleCloseDiscovery = useCallback(() => setIsDiscoveryOpen(false), []);

  // Generation HUD
  const [isGenerationHudOpen, setIsGenerationHudOpen] = useState(false);
  const handleOpenGenerationHud = useCallback(() => setIsGenerationHudOpen(true), []);
  const handleCloseGenerationHud = useCallback(() => setIsGenerationHudOpen(false), []);

  // Subject creation modals (HUD entry points)
  const [isIncrementalSubjectOpen, setIsIncrementalSubjectOpen] = useState(false);
  const [isImportSubjectOpen, setIsImportSubjectOpen] = useState(false);

  // Reset world dialog
  const [isResetWorldOpen, setIsResetWorldOpen] = useState(false);

  // Apply ?study= from the URL once on mount.
  useEffect(() => {
    const key = studyPanelStrategyKeyFromUrl(searchParams);
    if (key) {
      setStudyPanelStrategyForTesting(key);
    }
  }, [searchParams]);

  // Global hotkeys for the study panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (runStudyPanelHotkeyAction(e)) {
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <MentorBootstrapMount />
      <SceneClient />
      <ChatGptStyleHud
        onOpenDiscovery={handleOpenDiscovery}
        onOpenGenerationHud={handleOpenGenerationHud}
        onOpenIncrementalSubject={() => setIsIncrementalSubjectOpen(true)}
        onOpenImportSubject={() => setIsImportSubjectOpen(true)}
        onOpenResetWorld={() => setIsResetWorldOpen(true)}
        isAnySubjectGenerating={isAnySubjectGenerating}
      />
      <CrystalTopicLockedTooltip />
      <CrystalDeckPanel />
      <TextDecodingHelp />

      <DiscoveryModal isOpen={isDiscoveryOpen} onClose={handleCloseDiscovery} />
      <ContentGenerationHUD isOpen={isGenerationHudOpen} onClose={handleCloseGenerationHud} />
      <IncrementalSubjectModal
        isOpen={isIncrementalSubjectOpen}
        onClose={() => setIsIncrementalSubjectOpen(false)}
      />
      <ImportSubjectFromUrlModal
        isOpen={isImportSubjectOpen}
        onClose={() => setIsImportSubjectOpen(false)}
      />
      <ResetWorldDialog
        isOpen={isResetWorldOpen}
        onClose={() => setIsResetWorldOpen(false)}
      />

      <StudyPanel isOpen={studyPanelOpen} onClose={closeStudyPanel} />

      <MentorDialogOverlay
        onOpenDiscovery={handleOpenDiscovery}
        onOpenGenerationHud={handleOpenGenerationHud}
      />
    </main>
  );
}
