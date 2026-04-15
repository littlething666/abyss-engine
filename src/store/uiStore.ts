import { create } from 'zustand';

import type { TopicRef } from '@/types/core';
import { isDebugModeEnabled } from '@/infrastructure/debugMode';
import { telemetry } from '../features/telemetry';
import { useCrystalTrialStore } from '@/features/crystalTrial/crystalTrialStore';

function emitModalOpened(
  modalId: string,
  topic: TopicRef | null = null,
  sessionId: string | null = null,
) {
  telemetry.log('modal_opened', {
    modalId,
    action: 'opened',
    sessionId,
    topicId: topic?.topicId ?? null,
    subjectId: topic?.subjectId ?? null,
  });
}

function topicRefsEqual(a: TopicRef | null, b: TopicRef | null) {
  return (
    (a?.subjectId ?? null) === (b?.subjectId ?? null)
    && (a?.topicId ?? null) === (b?.topicId ?? null)
  )
}

/**
 * UI Store interface for managing UI state
 */
export interface UIStore {
  // State
  isDiscoveryModalOpen: boolean;
  isStudyPanelOpen: boolean;
  isRitualModalOpen: boolean;
  isStudyTimelineOpen: boolean;
  isCrystalTrialOpen: boolean;
  selectedTopic: TopicRef | null;
  isCurrentCardFlipped: boolean;

  // Computed
  isSelectionMode: boolean;

  // Actions
  openDiscoveryModal: () => void;
  closeDiscoveryModal: () => void;
  openStudyPanel: () => void;
  closeStudyPanel: () => void;
  openRitualModal: () => void;
  closeRitualModal: () => void;
  openStudyTimeline: () => void;
  closeStudyTimeline: () => void;
  openCrystalTrial: () => void;
  closeCrystalTrial: () => void;
  selectTopic: (topic: TopicRef | null) => void;
  flipCurrentCard: () => void;
  resetCardFlip: () => void;
}

export const selectIsAnyModalOpen = (s: UIStore) =>
  s.isDiscoveryModalOpen
  || s.isStudyPanelOpen
  || s.isRitualModalOpen
  || s.isStudyTimelineOpen
  || s.isCrystalTrialOpen;

// Create store without persistence - safe for SSR
// Using createStore pattern for Next.js App Router compatibility
const createUIStore = () =>
  create<UIStore>((set, get) => ({
    // Initial state
    isDiscoveryModalOpen: false,
    isStudyPanelOpen: false,
    isRitualModalOpen: false,
    isStudyTimelineOpen: false,
    isCrystalTrialOpen: false,
    selectedTopic: null,
    isCurrentCardFlipped: false,

    // Computed state - derived from selectedTopic
    get isSelectionMode() {
      return get().selectedTopic !== null;
    },

    // Actions
    openDiscoveryModal: () => {
      const state = get();
      if (state.isDiscoveryModalOpen) {
        return;
      }
      set({
        isDiscoveryModalOpen: true,
      });
      emitModalOpened('discovery', null, null);
    },
    closeDiscoveryModal: () => {
      set({
        isDiscoveryModalOpen: false,
      });
    },
    openStudyPanel: () => {
      const state = get();
      if (state.isStudyPanelOpen) {
        return;
      }
      set({
        isStudyPanelOpen: true,
      });
      emitModalOpened('study_panel', state.selectedTopic);
    },
    closeStudyPanel: () => {
      set({
        isStudyPanelOpen: false,
      });
    },
    openRitualModal: () => {
      const state = get();
      if (state.isRitualModalOpen) {
        return;
      }
      set({
        isRitualModalOpen: true,
      });
      emitModalOpened('attunement_ritual', state.selectedTopic);
    },
    closeRitualModal: () => {
      set({
        isRitualModalOpen: false,
      });
    },
    openStudyTimeline: () => {
      const state = get();
      if (state.isStudyTimelineOpen) {
        return;
      }
      set({
        isStudyTimelineOpen: true,
      });
      emitModalOpened('study_timeline', state.selectedTopic);
    },
    closeStudyTimeline: () => {
      set({
        isStudyTimelineOpen: false,
      });
    },
    openCrystalTrial: () => {
      const state = get();
      if (state.isCrystalTrialOpen) {
        return;
      }
      set({
        isCrystalTrialOpen: true,
      });
      emitModalOpened('crystal_trial', state.selectedTopic);
    },
    closeCrystalTrial: () => {
      const { selectedTopic } = get();
      if (selectedTopic) {
        useCrystalTrialStore.getState().cancelTrialAttempt(selectedTopic);
      }
      set({
        isCrystalTrialOpen: false,
      });
    },

    // Select a topic (or clear selection if null)
    selectTopic: (topic) => {
      const { selectedTopic } = get()
      if (topicRefsEqual(selectedTopic, topic)) {
        return
      }
      if (isDebugModeEnabled()) {
        const trialStore = useCrystalTrialStore.getState();
        const nextStatus = topic ? trialStore.getTrialStatus(topic) : 'idle';
        console.debug('[Abyss] Selected crystal changed', topic
          ? { subjectId: topic.subjectId, topicId: topic.topicId, trialStatus: nextStatus }
          : null);
      }
      set({ selectedTopic: topic })
    },

    flipCurrentCard: () => set((s) => ({ isCurrentCardFlipped: !s.isCurrentCardFlipped })),
    resetCardFlip: () => set({ isCurrentCardFlipped: false }),
  }));

// Create a singleton store - will be created once per module load
// This is safe for UI state that doesn't need persistence
const store = createUIStore();

/**
 * Hook to use the UI store
 * Uses the singleton store instance
 */
export const useUIStore = store;

// Export the raw store for direct access (e.g., in event handlers)
export { store as uiStore };
