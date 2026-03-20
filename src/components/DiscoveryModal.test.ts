import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import DiscoveryModal from './DiscoveryModal';

const progressionState = {
  getTopicsByTier: () => [],
  unlockTopic: () => null,
  unlockedTopicIds: [],
  activeCrystals: [],
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
  flushSync(() => {
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
    unlockPoints: 3,
    onOpenRitual,
    onClose,
    });

    const openRitualButton = document.body.querySelector('[aria-label="Open attunement ritual"]') as
      | HTMLButtonElement
      | null;
    expect(openRitualButton).not.toBeNull();
    openRitualButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenRitual).toHaveBeenCalledTimes(1);

    root.unmount();
  });

  it('renders an icon-only ritual action button', () => {
    const { container, root } = renderDiscoveryModal({
      isOpen: true,
    unlockPoints: 1,
    ritualCooldownRemainingMs: 5400000, // 1h 30m
    onOpenRitual: vi.fn(),
    onClose: vi.fn(),
    });

    const openRitualButton = document.body.querySelector('[aria-label="Open attunement ritual"]') as
      | HTMLButtonElement
      | null;
    expect(openRitualButton).not.toBeNull();
    expect(openRitualButton?.textContent?.trim()).toBe('🧪');
    root.unmount();
  });
});
