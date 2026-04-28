import { afterEach, describe, expect, it } from 'vitest';

import { selectIsAnyModalOpen, uiStore } from './uiStore';

function withReset<T>(fn: () => T): T {
  const previousState = uiStore.getState();
  const result = fn();
  uiStore.setState(previousState, true);
  return result;
}

describe('uiStore timeline modal state', () => {
  afterEach(() => {
    uiStore.setState({
      isDiscoveryModalOpen: false,
      isStudyPanelOpen: false,
      isRitualModalOpen: false,
      isStudyTimelineOpen: false,
      isGenerationProgressOpen: false,
      selectedTopic: null,
      isCurrentCardFlipped: false,
    });
  });

  it('opens and closes study timeline modal', () => {
    withReset(() => {
      uiStore.getState().openStudyTimeline();
      expect(uiStore.getState().isStudyTimelineOpen).toBe(true);
      expect(selectIsAnyModalOpen(uiStore.getState())).toBe(true);

      uiStore.getState().closeStudyTimeline();
      expect(uiStore.getState().isStudyTimelineOpen).toBe(false);
      expect(selectIsAnyModalOpen(uiStore.getState())).toBe(false);
    });
  });

  it('keeps any-modal-open true when another modal remains open', () => {
    withReset(() => {
      uiStore.setState({ isStudyPanelOpen: true });
      uiStore.getState().openStudyTimeline();
      expect(selectIsAnyModalOpen(uiStore.getState())).toBe(true);

      uiStore.getState().closeStudyTimeline();
      expect(uiStore.getState().isStudyTimelineOpen).toBe(false);
      expect(selectIsAnyModalOpen(uiStore.getState())).toBe(true);
    });
  });

  it('opens and closes generation progress through store actions', () => {
    withReset(() => {
      uiStore.getState().openGenerationProgress();
      expect(uiStore.getState().isGenerationProgressOpen).toBe(true);
      expect(selectIsAnyModalOpen(uiStore.getState())).toBe(true);

      uiStore.getState().closeGenerationProgress();
      expect(uiStore.getState().isGenerationProgressOpen).toBe(false);
    });
  });

  it('supports controlled generation progress open state', () => {
    withReset(() => {
      uiStore.getState().setGenerationProgressOpen(true);
      expect(uiStore.getState().isGenerationProgressOpen).toBe(true);

      uiStore.getState().setGenerationProgressOpen(false);
      expect(uiStore.getState().isGenerationProgressOpen).toBe(false);
    });
  });
});
