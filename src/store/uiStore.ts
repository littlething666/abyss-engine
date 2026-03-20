import { create } from 'zustand';
import { telemetry } from '../features/telemetry';

function emitModalOpened(modalId: string, topicId: string | null = null, sessionId: string | null = null) {
  telemetry.log('modal_opened', {
    modalId,
    action: 'opened',
    sessionId,
    topicId,
  });
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
  selectedTopicId: string | null;

  // Computed
  isSelectionMode: boolean;
  isAnyModalOpen: boolean;

  // Actions
  openDiscoveryModal: () => void;
  closeDiscoveryModal: () => void;
  openStudyPanel: () => void;
  closeStudyPanel: () => void;
  openRitualModal: () => void;
  closeRitualModal: () => void;
  openStudyTimeline: () => void;
  closeStudyTimeline: () => void;
  selectTopic: (topicId: string | null) => void;
}

// Create store without persistence - safe for SSR
// Using createStore pattern for Next.js App Router compatibility
const createUIStore = () =>
  create<UIStore>((set, get) => ({
    // Initial state
    isDiscoveryModalOpen: false,
    isStudyPanelOpen: false,
    isRitualModalOpen: false,
    isStudyTimelineOpen: false,
  isAnyModalOpen: false,
    selectedTopicId: null,

  // Computed state - derived from selectedTopicId
  get isSelectionMode() {
    return get().selectedTopicId !== null;
  },

    // Actions
    openDiscoveryModal: () => {
      const state = get()
      if (state.isDiscoveryModalOpen) {
      return
    }
      set({
        isDiscoveryModalOpen: true,
        isAnyModalOpen: true,
      })
      emitModalOpened('discovery', null, null);
    },
    closeDiscoveryModal: () => {
      const state = get()
      set({
      isDiscoveryModalOpen: false,
      isAnyModalOpen: state.isStudyPanelOpen || state.isRitualModalOpen || state.isStudyTimelineOpen,
    })
    },
    openStudyPanel: () => {
      const state = get()
      if (state.isStudyPanelOpen) {
      return
    }
      set({
        isStudyPanelOpen: true,
        isAnyModalOpen: true,
      })
      emitModalOpened('study_panel', state.selectedTopicId);
    },
    closeStudyPanel: () => {
      const state = get()
      set({
      isStudyPanelOpen: false,
      isAnyModalOpen: state.isDiscoveryModalOpen || state.isRitualModalOpen || state.isStudyTimelineOpen,
    })
    },
    openRitualModal: () => {
      const state = get()
      if (state.isRitualModalOpen) {
      return
    }
      set({
        isRitualModalOpen: true,
        isAnyModalOpen: true,
      })
      emitModalOpened('attunement_ritual', state.selectedTopicId);
    },
    closeRitualModal: () => {
      const state = get()
      set({
      isRitualModalOpen: false,
      isAnyModalOpen: state.isDiscoveryModalOpen || state.isStudyPanelOpen || state.isStudyTimelineOpen,
    })
    },
    openStudyTimeline: () => {
      const state = get()
      if (state.isStudyTimelineOpen) {
      return
    }
      set({
        isStudyTimelineOpen: true,
        isAnyModalOpen: true,
      })
      emitModalOpened('study_timeline', state.selectedTopicId);
    },
    closeStudyTimeline: () => {
      const state = get()
      set({
      isStudyTimelineOpen: false,
      isAnyModalOpen:
        state.isDiscoveryModalOpen || state.isStudyPanelOpen || state.isRitualModalOpen,
    })
    },

    // Select a topic (or clear selection if null)
    selectTopic: (topicId: string | null) => set({ selectedTopicId: topicId }),

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
