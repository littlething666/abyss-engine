import { create } from 'zustand';
import { telemetry } from '../features/telemetry';
import type { SubjectTopicRef } from '../lib/topicRef';

function emitModalOpened(modalId: string, topicRef: SubjectTopicRef | null = null, sessionId: string | null = null) {
  telemetry.log('modal_opened', {
    modalId,
    action: 'opened',
    sessionId,
    subjectId: topicRef?.subjectId ?? null,
    topicId: topicRef?.topicId ?? null,
  });
}

export interface UIStore {
  // State
  isDiscoveryModalOpen: boolean;
  isStudyPanelOpen: boolean;
  isRitualModalOpen: boolean;
  isStudyTimelineOpen: boolean;
  selectedTopicRef: SubjectTopicRef | null;
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
  selectTopic: (ref: SubjectTopicRef | null) => void;
  flipCurrentCard: () => void;
  resetCardFlip: () => void;
}

export const selectIsAnyModalOpen = (s: UIStore) =>
  s.isDiscoveryModalOpen
  || s.isStudyPanelOpen
  || s.isRitualModalOpen
  || s.isStudyTimelineOpen;

const createUIStore = () =>
  create<UIStore>((set, get) => ({
    isDiscoveryModalOpen: false,
    isStudyPanelOpen: false,
    isRitualModalOpen: false,
    isStudyTimelineOpen: false,
    selectedTopicRef: null,
    isCurrentCardFlipped: false,

    get isSelectionMode() {
      return get().selectedTopicRef !== null;
    },

    openDiscoveryModal: () => {
      const state = get();
      if (state.isDiscoveryModalOpen) return;
      set({ isDiscoveryModalOpen: true });
      emitModalOpened('discovery', null, null);
    },
    closeDiscoveryModal: () => set({ isDiscoveryModalOpen: false }),

    openStudyPanel: () => {
      const state = get();
      if (state.isStudyPanelOpen) return;
      set({ isStudyPanelOpen: true });
      emitModalOpened('study_panel', state.selectedTopicRef);
    },
    closeStudyPanel: () => set({ isStudyPanelOpen: false }),

    openRitualModal: () => {
      const state = get();
      if (state.isRitualModalOpen) return;
      set({ isRitualModalOpen: true });
      emitModalOpened('attunement_ritual', state.selectedTopicRef);
    },
    closeRitualModal: () => set({ isRitualModalOpen: false }),

    openStudyTimeline: () => {
      const state = get();
      if (state.isStudyTimelineOpen) return;
      set({ isStudyTimelineOpen: true });
      emitModalOpened('study_timeline', state.selectedTopicRef);
    },
    closeStudyTimeline: () => set({ isStudyTimelineOpen: false }),

    selectTopic: (ref: SubjectTopicRef | null) => set({ selectedTopicRef: ref }),

    flipCurrentCard: () => set((s) => ({ isCurrentCardFlipped: !s.isCurrentCardFlipped })),
    resetCardFlip: () => set({ isCurrentCardFlipped: false }),
  }));

const store = createUIStore();

export const useUIStore = store;
export { store as uiStore };
