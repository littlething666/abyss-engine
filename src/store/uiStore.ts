import { create } from 'zustand';

import type { TopicRef } from '@/types/core';
import { isDebugModeEnabled } from '@/infrastructure/debugMode';
import { appEventBus } from '@/infrastructure/eventBus';
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
  );
}

export interface UIStore {
  isDiscoveryModalOpen: boolean;
  isStudyPanelOpen: boolean;
  isRitualModalOpen: boolean;
  isStudyTimelineOpen: boolean;
  isCrystalTrialOpen: boolean;
  isGlobalSettingsOpen: boolean;
  selectedTopic: TopicRef | null;
  isCurrentCardFlipped: boolean;

  isSelectionMode: boolean;

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
  openGlobalSettings: () => void;
  closeGlobalSettings: () => void;
  selectTopic: (topic: TopicRef | null) => void;
  flipCurrentCard: () => void;
  resetCardFlip: () => void;
}

export const selectIsAnyModalOpen = (s: UIStore) =>
  s.isDiscoveryModalOpen
  || s.isStudyPanelOpen
  || s.isRitualModalOpen
  || s.isStudyTimelineOpen
  || s.isCrystalTrialOpen
  || s.isGlobalSettingsOpen;

const createUIStore = () =>
  create<UIStore>((set, get) => ({
    isDiscoveryModalOpen: false,
    isStudyPanelOpen: false,
    isRitualModalOpen: false,
    isStudyTimelineOpen: false,
    isCrystalTrialOpen: false,
    isGlobalSettingsOpen: false,
    selectedTopic: null,
    isCurrentCardFlipped: false,

    get isSelectionMode() {
      return get().selectedTopic !== null;
    },

    openDiscoveryModal: () => {
      if (get().isDiscoveryModalOpen) return;
      set({ isDiscoveryModalOpen: true });
      emitModalOpened('discovery', null, null);
    },
    closeDiscoveryModal: () => set({ isDiscoveryModalOpen: false }),
    openStudyPanel: () => {
      const state = get();
      if (state.isStudyPanelOpen) return;
      set({ isStudyPanelOpen: true });
      emitModalOpened('study_panel', state.selectedTopic);
      appEventBus.emit('study-panel:opened', {});
    },
    closeStudyPanel: () => set({ isStudyPanelOpen: false }),
    openRitualModal: () => {
      const state = get();
      if (state.isRitualModalOpen) return;
      set({ isRitualModalOpen: true });
      emitModalOpened('attunement_ritual', state.selectedTopic);
    },
    closeRitualModal: () => set({ isRitualModalOpen: false }),
    openStudyTimeline: () => {
      const state = get();
      if (state.isStudyTimelineOpen) return;
      set({ isStudyTimelineOpen: true });
      emitModalOpened('study_timeline', state.selectedTopic);
    },
    closeStudyTimeline: () => set({ isStudyTimelineOpen: false }),
    openCrystalTrial: () => {
      const state = get();
      if (state.isCrystalTrialOpen) return;
      set({ isCrystalTrialOpen: true });
      emitModalOpened('crystal_trial', state.selectedTopic);
    },
    closeCrystalTrial: () => {
      const { selectedTopic } = get();
      if (selectedTopic) {
        useCrystalTrialStore.getState().cancelTrialAttempt(selectedTopic);
      }
      set({ isCrystalTrialOpen: false });
    },
    openGlobalSettings: () => {
      if (get().isGlobalSettingsOpen) return;
      set({ isGlobalSettingsOpen: true });
      emitModalOpened('global_settings', null, null);
    },
    closeGlobalSettings: () => set({ isGlobalSettingsOpen: false }),

    selectTopic: (topic) => {
      const { selectedTopic } = get();
      if (topicRefsEqual(selectedTopic, topic)) return;
      if (isDebugModeEnabled()) {
        const trialStore = useCrystalTrialStore.getState();
        const nextStatus = topic ? trialStore.getTrialStatus(topic) : 'idle';
        console.debug('[Abyss] Selected crystal changed', topic
          ? { subjectId: topic.subjectId, topicId: topic.topicId, trialStatus: nextStatus }
          : null);
      }
      set({ selectedTopic: topic });
    },

    flipCurrentCard: () => set((s) => ({ isCurrentCardFlipped: !s.isCurrentCardFlipped })),
    resetCardFlip: () => set({ isCurrentCardFlipped: false }),
  }));

const store = createUIStore();

export const useUIStore = store;
export { store as uiStore };
