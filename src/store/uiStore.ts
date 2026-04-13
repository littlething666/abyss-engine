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
  selectTopic: (topicId: string | null) => void;
  flipCurrentCard: () => void;
  resetCardFlip: () => void;
}

export const selectIsAnyModalOpen = (s: UIStore) =>
  s.isDiscoveryModalOpen
  || s.isStudyPanelOpen
  || s.isRitualModalOpen
  || s.isStudyTimelineOpen;

// Create store without persistence - safe for SSR
// Using createStore pattern for Next.js App Router compatibility
const createUIStore = () =>
  create<UIStore>((set, get) => ({
    // Initial state
    isDiscoveryModalOpen: false,
    isStudyPanelOpen: false,
    isRitualModalOpen: false,
    isStudyTimelineOpen: false,
    selectedTopicId: null,
    isCurrentCardFlipped: false,

    // Computed state - derived from selectedTopicId
    get isSelectionMode() {
      return get().selectedTopicId !== null;
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
      emitModalOpened('study_panel', state.selectedTopicId);
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
      emitModalOpened('attunement_ritual', state.selectedTopicId);
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
      emitModalOpened('study_timeline', state.selectedTopicId);
    },
    closeStudyTimeline: () => {
      set({
        isStudyTimelineOpen: false,
      });
    },

    // Select a topic (or clear selection if null)
    selectTopic: (topicId: string | null) => set({ selectedTopicId: topicId }),

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
