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
      selectedTopicId: null,
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
});
