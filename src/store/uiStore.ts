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

/**
 * Sentinel value used by the discovery scope to indicate "open the modal in
 * all-subjects mode". Distinct from `null` (which means "caller did not
 * specify a scope, fall back to DiscoveryModal's sessionStorage default").
 */
export const DISCOVERY_MODAL_ALL_SUBJECTS = '__all_floors__' as const;
export type DiscoveryModalSubjectId =
  | string
  | typeof DISCOVERY_MODAL_ALL_SUBJECTS;

export interface UIStore {
  isDiscoveryModalOpen: boolean;
  isStudyPanelOpen: boolean;
  isRitualModalOpen: boolean;
  isStudyTimelineOpen: boolean;
  isCrystalTrialOpen: boolean;
  isGenerationProgressOpen: boolean;
  isGlobalSettingsOpen: boolean;
  selectedTopic: TopicRef | null;
  isCurrentCardFlipped: boolean;

  isSelectionMode: boolean;

  /**
   * Optional scope hint for the next Discovery modal open. When non-null,
   * DiscoveryModal prefers this over its sessionStorage default. Cleared
   * back to null on close.
   */
  discoveryModalSubjectId: DiscoveryModalSubjectId | null;

  /**
   * Open Discovery. Pass a subjectId (or `DISCOVERY_MODAL_ALL_SUBJECTS`) to
   * scope the modal; omit to fall back to the sessionStorage default.
   */
  openDiscoveryModal: (subjectId?: DiscoveryModalSubjectId) => void;
  closeDiscoveryModal: () => void;
  openStudyPanel: () => void;
  closeStudyPanel: () => void;
  openRitualModal: () => void;
  closeRitualModal: () => void;
  openStudyTimeline: () => void;
  closeStudyTimeline: () => void;
  openCrystalTrial: () => void;
  closeCrystalTrial: () => void;
  openGenerationProgress: () => void;
  closeGenerationProgress: () => void;
  setGenerationProgressOpen: (open: boolean) => void;
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
  || s.isGenerationProgressOpen
  || s.isGlobalSettingsOpen;

const createUIStore = () =>
  create<UIStore>((set, get) => ({
    isDiscoveryModalOpen: false,
    isStudyPanelOpen: false,
    isRitualModalOpen: false,
    isStudyTimelineOpen: false,
    isCrystalTrialOpen: false,
    isGenerationProgressOpen: false,
    isGlobalSettingsOpen: false,
    selectedTopic: null,
    isCurrentCardFlipped: false,
    discoveryModalSubjectId: null,

    get isSelectionMode() {
      return get().selectedTopic !== null;
    },

    openDiscoveryModal: (subjectId) => {
      const next = subjectId ?? null;
      // Always update the scope hint, even when re-opening; the previous open
      // may have left a stale subjectId if close races with another open
      // (e.g. mentor open_discovery then bubble click).
      if (get().isDiscoveryModalOpen) {
        if (get().discoveryModalSubjectId !== next) {
          set({ discoveryModalSubjectId: next });
        }
        return;
      }
      set({ isDiscoveryModalOpen: true, discoveryModalSubjectId: next });
      emitModalOpened('discovery', null, null);
    },
    closeDiscoveryModal: () =>
      set({ isDiscoveryModalOpen: false, discoveryModalSubjectId: null }),
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
    openGenerationProgress: () => {
      const state = get();
      if (state.isGenerationProgressOpen) return;
      set({ isGenerationProgressOpen: true });
      emitModalOpened('generation_progress', state.selectedTopic);
    },
    closeGenerationProgress: () => set({ isGenerationProgressOpen: false }),
    setGenerationProgressOpen: (open) => set({ isGenerationProgressOpen: open }),
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
