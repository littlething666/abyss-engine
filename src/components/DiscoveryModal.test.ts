import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import DiscoveryModal from './DiscoveryModal';

const progressionState = {
  getTopicsByTier: () => [],
  unlockTopic: () => null,
  unlockedTopicIds: [],
  activeCrystals: [],
  lockedTopics: [],
  getTopicUnlockStatus: () => ({
    canUnlock: false,
    hasPrerequisites: false,
    hasEnoughPoints: false,
    missingPrerequisites: [],
  }),
};

vi.mock('../features/progression', () => ({
  useProgressionStore: (selector: (state: typeof progressionState) => unknown) => selector(progressionState),
}));

vi.mock('../features/content', () => ({
  useAllGraphs: () => [],
  useSubjects: () => [],
  useSubjectGraphs: () => [],
}));

function renderDiscoveryModal(props: Parameters<typeof DiscoveryModal>[0]) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(createElement(DiscoveryModal, props));
  });
  return { container, root };
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('DiscoveryModal', () => {
  it('opens the attunement ritual modal through the header action', () => {
    const onOpenRitual = vi.fn();
    const onClose = vi.fn();
    const { container, root } = renderDiscoveryModal({
      isOpen: true,
      lockedTopicsCount: 0,
      unlockPoints: 3,
      onOpenRitual,
      onClose,
    });

    const openRitualButton = container.querySelector('[aria-label="Open attunement ritual"]') as
      | HTMLButtonElement
      | null;
    expect(openRitualButton).not.toBeNull();
    act(() => {
      openRitualButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onOpenRitual).toHaveBeenCalledTimes(1);

    root.unmount();
  });

  it('renders an icon-only ritual action button', () => {
    const { container, root } = renderDiscoveryModal({
      isOpen: true,
      lockedTopicsCount: 0,
      unlockPoints: 1,
      ritualCooldownRemainingMs: 5400000, // 1h 30m
      onOpenRitual: vi.fn(),
      onClose: vi.fn(),
    });

    const openRitualButton = container.querySelector('[aria-label="Open attunement ritual"]') as
      | HTMLButtonElement
      | null;
    expect(openRitualButton).not.toBeNull();
    expect(openRitualButton?.textContent?.trim()).toBe('🧪');
    root.unmount();
  });
});
