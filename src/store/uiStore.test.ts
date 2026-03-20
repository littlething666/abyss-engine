import { afterEach, describe, expect, it } from 'vitest';

import { uiStore } from './uiStore';

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
      isAnyModalOpen: false,
    });
  });

  it('opens and closes study timeline modal', () => {
    withReset(() => {
      uiStore.getState().openStudyTimeline();
      expect(uiStore.getState().isStudyTimelineOpen).toBe(true);
      expect(uiStore.getState().isAnyModalOpen).toBe(true);

      uiStore.getState().closeStudyTimeline();
      expect(uiStore.getState().isStudyTimelineOpen).toBe(false);
      expect(uiStore.getState().isAnyModalOpen).toBe(false);
    });
  });

  it('keeps isAnyModalOpen true when another modal remains open', () => {
    withReset(() => {
      uiStore.setState({ isStudyPanelOpen: true, isAnyModalOpen: true });
      uiStore.getState().openStudyTimeline();
      expect(uiStore.getState().isAnyModalOpen).toBe(true);

      uiStore.getState().closeStudyTimeline();
      expect(uiStore.getState().isStudyTimelineOpen).toBe(false);
      expect(uiStore.getState().isAnyModalOpen).toBe(true);
    });
  });
});
